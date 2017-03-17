/*
 * Here we attempt to avoid truncation by avoiding process.exit().
 * However we have an active handle (the running interval), that will result
 * in our script hanging.
 */

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

    process.exitCode = 42;
}

main();