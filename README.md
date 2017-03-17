# node-exeunt

A module for (and discussion on) exiting a node.js process *and flushing stdout
and stderr*.

Somewhere in the node.js 0.10 or 0.12 version range, and at least on certain
platforms including macOS and SmartOS, stdout and stderr stopped being
blocking. That means that where with node.js 0.10 or before your script might
write output and exit with `process.exit([CODE])`, with newer versions of
node.js your output to stdout and/or stderr *would sometimes not all get
written* before the process exited. This is most commonly an annoyance for
command-line tools written in node.js, especially when used in a pipeline where
the problem more often manifests itself. The issue is surprisingly (at least to
me) complex. This repo will attempt to explain the tradeoffs with different
solutions and provide advice and one or more functions to use for exiting.


## Usage

```javascript
var exeunt = require('exeunt');

function main() {
    // ...

    exeunt(code);   // flush stdout/stderr and exit
    return;         // `exeunt` returns, unlike `process.exit`
}
```

See the [Solution 4](#solution-4-exeunt) section below for details.

Note: `exeunt()` is a small function. If you don't want yet another node
dependency, then feel free to just copy it to your repo.


## The problem

A [node.js
script](https://github.com/joyent/node-exeunt/blob/master/examples/write-65k-and-exit.js)
writes a lot of output (such that buffering occurs), [and then
exits](https://github.com/joyent/node-exeunt/blob/master/examples/write-65k-and-exit.js#L15).
Not all output will be written before the process terminates. E.g.:

```
$ node examples/write-65k-and-exit.js | grep meta
[meta] start: writing 66560 bytes...
                                        # 65k of output elided by the `grep`
[meta] done                             # all output was emitted this time

$ node examples/write-65k-and-exit.js | grep meta
[meta] start: writing 66560 bytes...
                                        # the final 'done' line is missing
```

This example writes 65k to be more than the buffer size for a pipe (which is
64k, at least on macOS, IIUC). If we increase that to ~1MB, it is more frequent
that output is truncated:

```
$ node examples/write-65k-and-exit.js 1000000 | grep meta
[meta] start: writing 1000000 bytes...
```


## Solution 1: avoid process.exit

Summary: Use `process.exitCode = code;` (added in node.js 0.12), do *not* use
`process.exit([code])`, and ensure you have no active handles
(`process._getActiveHandles()`).

Pros:
- All stdout and stderr content will be written before the node.js process
  exits. AFAIK this is the only solution that guarantees this.

Cons:
- You need to be diligent about closing active handles (from `setTimeout`,
  `setInterval`, open sockets, etc.) otherwise your script will hang on exit.
- In node 0.10 (if you need to support it), there is no way to exit with a
  non-zero exit code without `process.exit(code)`.


[Example](https://github.com/joyent/node-exeunt/blob/master/examples/hang-because-active-handle.js)
showing an accidental hang on exit:

```
$ node examples/hang-because-active-handle.js | grep meta
[meta] start: writing 66560 bytes...
[meta] done
[meta] this interval is still running
[meta] this interval is still running
[meta] this interval is still running
^C
```

If you need to support node 0.10, [here is a `softExit()`
function](https://github.com/joyent/node-exeunt/blob/master/lib/exeunt.js#L26-56)
that will use `process.exitCode` if the node version supports it, else fallback
to `process.exit` if necessary (with the potential for truncation).


## Solution 2: give it a few seconds, then play hardball

Summary: Attempt to avoid process.exit, but set a timer to use it after a
short while if it looks like we are hanging.

Pros:
- In correct operation, your script will write out all stdout/stderr before
  exiting.

Cons:
- If stdout/stderr takes more than 2s (or whatever timeout you choose) to
  flush, then output will still be truncated. This is the main tradeoff to
  avoid a hang.
- This technique involves calling a function that doesn't synchronously
  exit the process like `process.exit()` does. That means you need to handle
  it returning and code still executing. That might be as simple as calling
  `return;`, or it might be more difficult. It depends on your application's
  code.


[Example](https://github.com/joyent/node-exeunt/blob/master/examples/hardball-after-2s.js#L25-L33):

```
$ node examples/hardball-after-2s.js | grep meta
[meta] start: writing 66560 bytes...
[meta] done
[meta] this interval is still running
[meta] this interval is still running
[meta] hardball exit, you had your chance
```


## Solution 3: set stdout/stderr to be blocking

This all started because stdout/stderr weren't blocking. Let's just set them
to be blocking again.

Pros:
- Stdout and stderr will be flushed as soon as your script writes to them.

Cons:
- The *node event loop can block* if the other end of those pipes isn't reading!
  This was a subtlety that surprised me.
  See <https://gist.github.com/misterdjules/3aa4c77d8f881ffccba3b6e6f0050d03>
  for an example showing this. (TODO: include those scripts in examples/ here.)

[Example](https://github.com/joyent/node-exeunt/blob/master/examples/set-blocking-write-65k-and-exit.js#L8-L10):

```
$ node examples/set-blocking-write-65k-and-exit.js 1000000 | grep meta
[meta] start: writing 1000000 bytes...
[meta] done
```


## Solution 4: exeunt

Set stdout/stderr to be blocking, but *only when about to exit*.

Usage:

```javascript
var exeunt = require('exeunt');

function main() {
    // ...

    exeunt(code);   // flush stdout/stderr and exit
    return;         // `exeunt` returns, unlike `process.exit`
}
```

Pros:
- Stdout and stderr will *most likely* (see below) be flushed before exiting.
- Because `exeunt()` is calling `process.exit()`, there is no special issue with
  the node event loop blocking.

Cons:
- `exeunt()` calls `process.exit()` *asynchronously* (in `setImmediate`), which
  means need to handle code still executing. Depending on how your code is
  structured, that might just require calling `return;`.
- `process.exit` is called in `setImmediate` to ensure that one more pass
  through the event loop will flush stdout/stderr. That event loop pass will
  also run timers (as part of `uv__run_timers()` in `uv_run()`). I.e. current
  `setTimeout`s and `setIntervals` may run one more time. My expectation is that
  this shouldn't be a practical concern for most programs, but it might be
  for yours.


[Example](https://github.com/joyent/node-exeunt/blob/master/examples/write-65k-and-exeunt.js#L17):

```
$ node examples/write-65k-and-exeunt.js 1000000 | grep meta
[meta] start: writing 1000000 bytes...
[meta] done
```

The code, to show what is happening, is here:
<https://github.com/joyent/node-exeunt/blob/master/lib/exeunt.js#L59-L87>.
There are some subtleties.

First, we can't just exit synchronously:

```javascript
setBlocking();
process.exit(code);
```

because that will synchronously call the exit syscall, and the process will
terminate, before any IO handling to write buffered stdout/stderr. Instead
we use `setImmediate` to ensure that there is one more run through the
node event loop which [calls
`uv__io_poll`](https://github.com/nodejs/node/blob/v4.8.0/deps/uv/src/unix/core.c#L354)
to service IO requests before [calling our `setImmediate`
handler](https://github.com/nodejs/node/blob/v4.8.0/deps/uv/src/unix/core.c#L355).

Second, we said that stdout/stderr will "most likely be flushed" above, because
it appears that [`uv__io_poll` is
tuned](https://github.com/nodejs/node/blob/v4.8.0/deps/uv/src/unix/kqueue.c#L150)
to handle a finite number of IO events in a single event loop pass. Currently
that number is 48. We *believe* that means that if there are more than 48
IO events (say, a pool of 50 sockets with data to read or write), then it is
possible that the single event loop pass before exiting will *not* handle
flushing stdout/stderr. If this is possible for your situation, then this
"Solution" might not be helpful for you.


## Open Questions

We haven't verified all our observations yet. This section includes Rumsfeldian
known unknowns.

- We need to verify the observations I've made above. At time of writing I was
  testing out the above examples with node v4.8.0 on macOS 10.11.6.

- Is our quick read of the libuv's `uv__io_poll` (which is called once for each
  pass through the node event loop) that only 48 events will be serviced in one
  pass correct?
    https://github.com/nodejs/node/blob/v4.8.0/deps/uv/src/unix/kqueue.c#L150
  Test it.

- Test yargs' cases using setBlocking, e.g.
  <https://github.com/yargs/yargs/blob/8756a3c63dfd2ceae303067b46075de5c982af66/yargs.js#L1010-L1012>
  to see if they work.


## See Also

- [nodejs/node#6980](https://github.com/nodejs/node/issues/6980)
  "Tracking issue: stdio problems".
  The node.js core issue that aims to be the tracker for issues related to this.
  Aside: One of the [linked issues](https://github.com/nodejs/node/issues/6456)
  includes this:

    > If this is currently breaking your program, please use this temporary fix:
    >
    >     [process.stdout, process.stderr].forEach((s) => {
    >       s && s.isTTY && s._handle && s._handle.setBlocking &&
    >         s._handle.setBlocking(true)
    >     })

  I believe the `s.isTTY` guard needs to be dropped.

- [nodejs/node@ab3306a](https://github.com/nodejs/node/commit/ab3306ad51d8136014aa0fa9278b57bb77105320)
  is the commit where a *TTY* is set to blocking. This is why (at least for
  node releases with this commit), stdout/stderr flushing is not an issue for
  a node app called interactively and without piping into another program.

- <https://github.com/yargs/set-blocking> is a small module related to the same
  problem. It states: "In yargs we only call setBlocking(true) once we already
  know we are about to call process.exit(code)."  This is therefore similar
  to "Solution 4" described here, and the provided `exeunt()` function.
  It isn't clear to me all of yargs' usages of this pattern call `process.exit`
  in a separate tick, which is necessary to actually flush output.


## License

MPL 2.0
