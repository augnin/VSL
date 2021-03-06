#!/usr/bin/env node
import * as modes from './mode';

const subcommands = Object.create(null);
subcommands["run"] = modes.Default;
subcommands["build"] = modes.Build;
subcommands["clean"] = modes.Clean;
subcommands["docgen"] = modes.Docgen;
subcommands["install"] = modes.Install;
subcommands["bindgen"] = modes.Bindgen;
subcommands["doctor"] = modes.Doctor;
subcommands["parser-server"] = modes.ParserServer;
subcommands["analysis"] = modes.Analysis;

let args = process.argv.slice(2);
let cmd = subcommands[args[0]];
if (args[0] === 'debugsrc') {
    cmd = modes.Debugsrc;
    args.shift();
} else if (!cmd) {
    cmd = modes.Default;
} else {
    args.shift();
}
(new cmd()).run(args, Object.keys(subcommands));
