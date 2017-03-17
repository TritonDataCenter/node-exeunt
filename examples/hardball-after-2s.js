/*
 * Here we attempt to avoid truncation by avoiding process.exit().
 * However, we have a fallback that will report to `process.exit` after two
 * seconds -- assuming that if that is reached that the script has hung.
 */

var exeunt = require('../');

function hardballExit(code) {
    exeunt.softExit(code);

    var timeout = setTimeout(function () {
        process.stderr.write('[meta] hardball exit, you had your chance\n');
        process.exit(code);
    }, 2000);
    timeout.unref(); // don't be another active handle
}

function main() {
    var interval = setInterval(function () {
        process.stderr.write('[meta] this interval is still running\n');
    }, 1000);

    var size = Number(process.argv[2]) || 65 * 1024;
    var buff = new Buffer(size);
    buff.fill('a');

    process.stdout.write('[meta] start: writing ' + size + ' bytes...\n');
    process.stdout.write(buff);
    process.stdout.write('\n[meta] done\n');

    hardballExit(42);
    return;
}

main();
