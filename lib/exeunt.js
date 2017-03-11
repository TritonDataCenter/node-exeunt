/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright 2017 Joyent, Inc.
 */

'use strict';


/*
 * Call:
 *      setBlockingAndExitImmediate([code]);
 *      return;
 * instead of:
 *      process.exit([code]);
 * to attempt to ensure stdout/stderr are flushed before exiting.
 *
 * Note that this isn't perfect. See the README for considerations.
 */
function exeuntSetBlockingAndExitImmediate(code) {
    if (code === undefined) {
        code = 0;
    }

    // Set stdout and stderr to be blocking *before* we exit...
    setBlocking();

    // ...then exit. However, we must do so in a way that node (libuv) will
    // do another pass through the event loop to handle async IO (in
    // `uv__io_poll`).
    setImmediate(function processExit() {
        process.exit(code);
    });
}


function setBlocking() {
    [process.stdout, process.stderr].forEach(function (s) {
        s && s._handle && s._handle.setBlocking && s._handle.setBlocking(true);
    });
}


module.exports = exeuntSetBlockingAndExitImmediate;
