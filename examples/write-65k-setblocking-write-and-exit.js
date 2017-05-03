/*
 * See <https://github.com/joyent/node-exeunt/issues/2>
 *
 * This is an attempt to see if we can squeeze out some "blocking writes"
 * just before program exit by writing *after* setting output streams blocking
 * but before calling `process.exit`.
 *
 * Usage:
 *      node write-65k-setblocking-write-and-exit.js | grep meta
 *
 * Conclusion: If the stdout buffer is full (which it is if we have written
 * >65k), then writes after `setBlocking` do NOT immediately get written. We
 * still need another pass through the event loop (which is what exeunt()
 * does).
 */

function setBlocking() {
    [process.stdout, process.stderr].forEach(function setStreamBlocking(s) {
        if (s && s._handle && s._handle.setBlocking) {
            s._handle.setBlocking(true);
        }
    });
}

function main() {
    var size = Number(process.argv[2]) || 65 * 1024;
    var buff = new Buffer(size);
    buff.fill('a');

    process.stdout.write('[meta] start: writing ' + size + ' bytes...\n');
    process.stdout.write(buff);
    process.stdout.write('\n[meta] done\n');

    setBlocking();
    for (var i = 0; i < 65*1024; i++) {
        process.stdout.write('[meta] more\n');
    }
    process.stdout.write('[meta] done with more\n');

    process.exit(42);
}

main();
