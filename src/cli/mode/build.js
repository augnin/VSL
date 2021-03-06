import CompilerCLI, { DEFAULT_STL } from '../helpers/CompilerCLI';
import TempFileManager from '../helpers/TempFileManager';
import path from 'path';
import fs from 'fs-extra';
import tty from 'tty';

import hrtime from 'browser-process-hrtime';

import { spawn } from 'child_process';
import { parse as urlParse } from 'url';

import LLVMBackend, { Targets } from '../../vsl/backend/llvm';
import FilterExpression from '../../modules/FilterExpression';
import prettyPrintPerformance from '../helpers/prettyPrintPerformance';

import findDefaultLinker from '../helpers/findDefaultLinker';
import findCRT from '../helpers/findCRT';
import Linker from '../helpers/Linker';
import * as linkers from '../helpers/linkers';
import Triple from '../helpers/Triple';

export default class Build extends CompilerCLI {
    usage = "vsl build [options] <module | files> -o <out file>\nvsl build info <target>"

    constructor() {
        super([
            ["Options", [
                ["-h", "--help"          , "Displays this help message",             { run: _ => _.help() }],
                ["--verbose"             , "Prints a little bit of debug info",      { verbose: true }],
                ["--targets"             , "Lists supported compilation targets " +
                                           "for more compile to LLVM `.bc`",         { run: _ => _.listTargets() }],
                ["--linkers"             , "Lists linkers and if they are " +
                                           "supported on your environment.",         { run: _ => _.getListLinkers().then(text => _.printAndDie(text)) }],
                ["--default-linker"      , "Returns default linker command used",    { run: _ => { findDefaultLinker().then(linker => linker.getCommandName()).then(name => _.printAndDie(name)); return false } }],
                ["--crt-path"            , "Outputs the CRT path that would " +
                                           "be used with typical linker usage",      { run: _ => { findCRT().then(path => _.printAndDie(path)); return false } }],
                ["--color"               , "Colorizes all output where applicable",  { color: true }],
                ["--no-color"            , "Disables output colorization",           { color: false }],
            ]],
            ["Build Configuration", [
                ["-o"                    , "Required. Specifies output file. Use" +
                                           "`-` for STDOUT.",                        { arg: "file", output: true }],
                ["-O"                    , "Optimization level, default is 2." +
                                           "Values are [0, 3], 3 being most " +
                                           "optimized.",                             { arg: "opt", opt: true }],
                ["-g", "--debug"         , "Performs a 'debug' or development " +
                                           "build. This allows nicer errors.",       { debug: true }],
                ["--artifacts"           , "Leaves compilation artifacts",           { run: _ => { TempFileManager.willCleanup = false; return true } }],
                ["-P", "--parser-server" , "Specifies the address of the VSL parser " +
                                           "server to connect to. You can start a " +
                                           "server using the `vsl parser-server` " +
                                           "command.",                               { arg: "address", parserServer: true }],
                ["-c", "--cache"         , "Enables build cache from a given dir " +
                                           "this generates artifacts which prevent " +
                                           "extra builds. See the `cache.directory` " +
                                           "option for modules.",                    { arg: "cacheDir", cache: true }],
                ["-l", "--library"       , "Specifies a C library to link with",     { arg: "library", library: true }],
                ["--linker"              , "Specifies a VSL-supported linker to " +
                                           "use",                                    { arg: "linker", linker: true }],
                ["-Xl"                   , "Specifies an extra linker argument",     { arg: "arg", xlinker: true }],
                ["-Xllc"                 , "Specifies an argument to LLC.",          { arg: "arg", xllc: true }],
                ["-S", "--no-build"      , "Prevents assembly and linkage, " +
                                           "outputs LLVM IR",                        { link: false }],
                ["-ir"                   , "Dumps IR to STDOUT. Equal to `-S -o -`", { link: false, stdout: true }],
                ["-t", "--target"        , "Compilation target. To see all " +
                                           "targets, use \`vsl build --targets\`",   { arg: "target", target: true }],
                ["-T", "--triple"        , "The target triple to use for " +
                                           "compilation. ",                          { arg: "triple", triple: true }]
            ]],
            ["Toolchain Options", [
                ["-flto"                 , "Enables link-time optimizations. " +
                                           "You usually want to enable this but " +
                                           "you'd need to have built your " +
                                           "toolchain/linker to support it",         { lto: true }]
            ]],
            ["Compiler Options", [
                ["--stl"                 , "Specifies a different standard type " +
                                           "library. The default " +
                                           "is " + DEFAULT_STL + ". Otherwise " +
                                           "this chooses the STL from a " +
                                           "module.yml. This must be a module " +
                                           "installed in the library path.",         { stl: true, arg: "name" }],
                ["--no-stl"              , "Disables the STL. This can be " +
                                           "overriden with a module.yml",            { nostl: true }],
                ["-Wno"                  , "Disables all warnings, also prevents " +
                                           "relevent FIX-ITs from activating",       { warn: false }],
                ["-Wd"                   , "Disables a specific warning by name",    { warn: 2, arg: "name" }],
                ["-fno-dynamic"          , "Disabled dynamic dispatch, runtime casts, " +
                                           "and other dynamic features. Limited use " +
                                           "case since the VSL compiler does not " +
                                           "generate unused synthesized dynamic " +
                                           "code.",                                  { compilerOption: "disableDynamic", value: true }],
                ["-fno-free-memop"       , "Prevents the memory optimizer from " +
                                           "inserting free() operations. This should " +
                                           "only be used to identify issues caused" +
                                           "by the allocator as this means no heap " +
                                           "allocated memory will be cleaned. Allocations operations " +
                                           "moved to stack may still take place.",   { compilerOption: "disableMemopFree", value: true }],
                ["-fno-rtti"             , "Disables RTTI. Any reflection operations " +
                                           "will segfault. By enabling, undefined  " +
                                           "behavior is introduced on RTTI operations. " +
                                           "Do note that the VSL compiler already does " +
                                           "not generate RTTI code unless it is needed, " +
                                           "so the use-case for this is limited.",   { compilerOption: "disableRTTI", value: true }],
                ["-fparallel"            , "Enables support for parallelism and " +
                                           "thread-safe code within the compiler. This " +
                                           "means synthesized code will use the " +
                                           "appropriate intrinsics and the compiler " +
                                           "will ensure thread conflicts don't occur. " +
                                           "This does not ensure logical errors such as " +
                                           "invalid values occuring but it does prevent " +
                                           "VSL internally entering an undefined state " +
                                           "such as data races.",                    { compilerOption: "isParallel", value: true }],
                ["-ftrapv"               , "Traps on overflow. Induces a fixed " +
                                           "overhead on all integer operations",     { compilerOption: "trapOnOverflow", value: true }],
                ["-ftrap-lossy-bitcast"  , "Traps if a bitcast were to result in " +
                                           "information being lost.",                { compilerOption: "trapLossyButcast", value: true }],
                ["-ftrap-memop"          , "Manually verifies if heap allocations, " +
                                           "were successful. Some OSes such as linux " +
                                           "will rarely concede that they are out of " +
                                           "memory so this is not needed. Additionally, " +
                                           "sometimes 0x00 might be a valid address. " +
                                           "Check with your OS to see if seeting " +
                                           "this option would make sense.",          { compilerOption: "disableAllocCheck", value: false }]
            ]],
            ["Debugging Options", [
                ["--perf-breakdown"      , "Offers performance breakdown on what " +
                                           "parts of transformation time is spent.", { perfBreakdown: true }]
            ]]
        ]);

        this.subcommands = [ "run" ];
    }

    appInfo() {
        return `Toolchain for compiling VSL files.`;
    }

    listTargets() {
        let targetText = 'Directly supported VSL targets:\n\n';

        for (let [target] of Targets) {
            targetText += `  - ${target}\n`;
        }

        targetText += '\nFor more, compile to LLVM IR using `-S` and use ' +
            '`llc` or use --triple with `native`';
        this.printAndDie(targetText);
    }

    async getListLinkers() {
        let targetText = [];

        for (const [name, cls] of Object.entries(linkers)) {
            const instance = new cls();
            const isInstalled = await instance.getCommandName()
            const isSupported = isInstalled && await instance.check();
            targetText.push(`${name}\t${
                isSupported ?
                    '\u001B[32mSupported\u001B[0m' :
                    isInstalled ?
                        '\u001B[31mNot Available\u001B[0m' :
                        '\u001B[31mNot Installed\u001B[0m'}`);
        }

        return targetText.join('\n');
    }

    async run(args) {
        if (args[0] === 'info') {
            if (!args[1]) this.error.cli(`provide target to get info on`);
            this.getInfo(args[1]);
        }

        let color = tty.isatty(1);
        let perfBreakdown = false;
        let stl = DEFAULT_STL;
        let link = true;
        let target = 'native';
        let triple = undefined;
        let linker = undefined;
        let lto = false;
        let cacheDir = null;
        let parserServer = null;

        let linkerArgs = [];
        let llcArgs = [];
        let libraries = [];

        let emitIR = false;

        let verbose = false;

        let compilerOptions = {};
        let directory = null;
        let files = [];
        let outputStream = null;
        let opt = 2; // Optimization level

        if (args.length === 0) {
            this.help();
        }
        for (let i = 0; i < args.length; i++) {
            if (args[i][0] === "-" && args[i].length > 1) {
                const flagName = this.allArgs[this.aliases[args[i]] || args[i]];
                if (!flagName) this.error.cli(`unknown flag: ${args[i]}`);

                const flagInfo = flagName[3] || flagName[2];

                if (flagInfo.run) {
                    const runResult = await flagInfo.run(this);
                    if (runResult === false) {
                        return;
                    }
                }

                if ('verbose' in flagInfo) verbose = flagInfo.verbose;
                if ('color' in flagInfo) color = flagInfo.color;
                if ('link' in flagInfo) link = flagInfo.link;
                if ('nostl' in flagInfo) stl = false;
                if ('perfBreakdown' in flagInfo) perfBreakdown = true;
                if ('library' in flagInfo) libraries.push(args[++i]);
                if ('xllc' in flagInfo) llcArgs.push(args[++i]);
                if ('xlinker' in flagInfo) linkerArgs.push(args[++i]);
                if ('stl' in flagInfo) stl = args[++i];
                if ('opt' in flagInfo) opt = args[++i];
                if ('linker' in flagInfo) linker = args[++i];
                if ('stdout' in flagInfo) outputStream = process.stdout;
                if ('lto' in flagInfo) lto = true;
                if ('parserServer' in flagInfo) parserServer = args[++i];
                if ('cache' in flagInfo) cacheDir = args[++i];
                if ('target' in flagInfo) target = args[++i];
                if ('triple' in flagInfo) triple = args[++i];
                if ('compilerOption' in flagInfo) {
                    compilerOptions[flagInfo['compilerOption']] = flagInfo['value'];
                }
                if (flagInfo.output) {
                    let path = args[++i];
                    if (outputStream) {
                        this.error.cli(`Already provided an output.`);
                    } else  if (path === '-') {
                        outputStream = process.stdout;
                    } else {
                        outputStream = fs.createWriteStream(path, { mode: 0o755 });
                    }
                }
            } else {
                // Check if directory, file, STDIN, or neither
                if (args[i] !== '-' && !fs.existsSync(args[i])) {
                    this.error.cli(`no such file or directory: \`${args[i]}\``);
                }

                if (directory) {
                    this.error.cli(
                        `already specified directory (\`${directory}\`), ` +
                        `cannot supply more files`
                    );
                }

                if (args[i] !== '-' && fs.statSync(args[i]).isDirectory()) {
                    directory = args[i];
                } else {
                    files.push(args[i]);
                }
            }
        }

        this.color = color;
        this.error.shouldColor = this.color;
        this.stl = stl;
        this.link = link;
        this.linker = linker;
        this.enableLTO = lto;
        this.perfBreakdown = perfBreakdown;
        this.tty = tty.isatty(1);

        this.verbose = verbose;

        for (let i = 0; i < libraries.length; i++) {
            this.libraries.add(libraries[i]);
        }

        this.linkerArgs = linkerArgs;
        this.llcArgs = llcArgs;

        this.outputStream = outputStream;

        if (cacheDir) {
            this.cacheDirectory = path.resolve(cacheDir);
        }

        if (parserServer) {
            const parts = urlParse(`vslc://${parserServer}`);
            let parserServerExpression;

            if (parts.port) {
                parserServerExpression = { host: parts.hostname, port: parts.port };
            } else if (parts.path) {
                parserServerExpression = { path: parts.path }
            } else {
                this.error.cli(`could not find port in server expression \`${parserServer}\``);
            }

            this.parserServer = parserServerExpression;
        }

        if (![0, 1, 2, 3].includes(+opt)) {
            this.error.cli(`invalid optimization level ${opt}`);
        }
        this.optimizationLevel = opt;


        if (this.outputStream === null) {
            this.error.cli(`Provide output location.`);
        }

        // Check if target exists
        this.target = target;

        if (triple) {
            this.triple = triple;
        }

        let backend = new LLVMBackend(this.createStream(), this.triple);
        Object.assign(backend.options, compilerOptions);

        this.start = hrtime();
        if (directory) {
            this.executeModule(directory, backend)
                .then(({ module }) => {
                    this.compileLLVM(backend);
                });
        } else if (files.length > 0) {
            this.fromFiles(files, backend)
                .then((index) => {
                    this.compileLLVM(backend);
                });
        } else {
            this.help();
        }
    }

    /**
     * Prints to verbose log
     * @param {string} message
     */
    printLog(message) {
        if (this.verbose) console.log(`vsl: ${message}`);
    }

    /**
     * Returns the target triple
     * @type {string}
     */
    get triple() {
        return this._triple;
    }

    _triple = null;
    /**
     * If we explicitly overide the triple
     * @type {string}
     */
    set triple(triple) {
        this.filterTarget = FilterExpression.tripleToTarget(triple);
        this._triple = triple;
    }

    /**
     * @type {string}
     */
    get target() {
        return this._target || Targets.get('native');
    }

    /**
     * Sets the target
     * @type {string}
     */
    set target(target) {
        let targetData = Targets.get(target);
        if (!targetData) {
            this.error.cli(`unknown target ${target} see \`vsl build --targets\``);
        } else {
            this._target = targetData;
            this.triple = targetData.triple;
        }
    }

    /**
     * Prints info on target
     * @param {string} target
     */
    getInfo(target) {
        let targetData = Targets.get(target);
        if (!targetData) this.error.cli(`unknown target ${target}`);
        this.printAndDie(
            `\u001B[1m${target}:\u001B[0m ` + targetData.info +
                '\n Default Triple: ' + targetData.triple
        )
    }

    /**
     * Finishes LLVM compilation
     * @param {Backend} backend backend
     */
    async compileLLVM(backend) {
        if (this.link === false) {
            if (this.optimizationLevel == 0) {
                this.outputStream.write(backend.getByteCode());
            } else {
                // Optimize and output byte code
                const opt = await this.opt(backend.getByteCode(), {
                    triple: this.triple,
                    optLevel: this.optimizationLevel,
                    emitByteCode: true,
                    redirect: this.outputStream
                });
            }
        } else {
            // Otherwise compile to
            const fileManager = new TempFileManager();
            const byteCode = backend.getByteCode();


            // First optimize using -O
            const opt = await this.opt(byteCode, {
                triple: this.triple,
                optLevel: this.optimizationLevel
            });

            this._colorCompilationStep(`<<input.ll>>`, `$opt`);

            switch (this.target.command) {
                case "ld":
                case "nold":
                    let asmFile = fileManager.tempWithExtension(this.target.type === 'asm' ? 's' : 'o');

                    await this.llc(opt, asmFile, {
                        triple: this.triple,
                        type: this.target.type
                    });

                    this._colorCompilationStep(`$opt`, asmFile);

                    switch (this.target.command) {
                        case "ld":
                            let outFile = fileManager.tempWithExtension('out');
                            await this.ld(asmFile, outFile, {
                                triple: this.triple
                            });
                            this._colorCompilationStep(asmFile, outFile);

                            let readStream = fs.createReadStream(outFile);
                            readStream.pipe(this.outputStream);
                            this._colorCompilationStep(outFile, '<<output>>');

                            break;

                        case "nold":
                            let asmStream = fs.createReadStream(asmFile);
                            asmStream.pipe(this.outputStream);
                            this._colorCompilationStep(asmFile, '<<output>>');
                            break;

                        default: break;
                    }

                    break;
                case "wasm":
                    const bcFile = await fileManager.tempWithExtensionAndData('bc', opt);
                    this._colorCompilationStep('$opt', bcFile);

                    const wasmFile = await fileManager.tempWithExtension('wasm');

                    await this.wasmLink([bcFile], wasmFile);

                    this._colorCompilationStep(bcFile, wasmFile);

                    let wasmStream = fs.createReadStream(wasmFile);
                    wasmStream.pipe(this.outputStream);
                    this._colorCompilationStep(wasmFile, '<<output>>');

                    break;
                default:
                    this.error.cli(`target compiles with unknown step ${this.command}.`);
            }
        }

        let elapsed = hrtime(this.start);
        let timeInMs = (elapsed[0] * 1e3 + elapsed[1] / 1e6).toFixed(2);
        if (this.tty) {
            if (this.color) {
                console.log(`\n\u001B[1;32mSuccesfully compiled in ${timeInMs}ms\u001B[0m`);
            } else {
                console.log(`\nSuccesfully compiled in ${timeInMs}ms`);
            }
        }
    }

    /**
     * Compiles and links WASM
     * @param {string[]} file the input files (LLVM or WASM)
     * @param {string} outfile the output file
     * @return {Promise}
     */
    async wasmLink(files, outfile) {
        return new Promise((resolve, reject) => {
            const args = files.concat([
                '-o', outfile,
                '--entry', 'main',
                `--export=__wasm_call_ctors`,
                `--export=__heap_base`
            ]);

            args.push(...this.linkerArgs);

            this.printLog(`$ wasm-ld ${args.join(" ")}`);

            let wasmMerge = spawn('wasm-ld', args, {
                stdio: ['ignore', 'inherit', 'inherit']
            });

            wasmMerge.on('error', (error) => {
                switch (error.code) {
                    case "ENOENT":
                        this.error.cli(`failed: could not locate wasm-ld binary. Ensure lld is installed.`);
                    default:
                        this.error.cli(`failed: ${error.message} (${error.code})`);
                }
            });

            wasmMerge.on('exit', (errorCode) => {
                if (errorCode === 0) {
                    resolve();
                } else {
                    this.error.cli(`failed: wasm-ld: exited with ${errorCode}`);
                }
            })
        });
    }


    /**
     * Attempts to link source `.o` together with libraries etc.
     * @param {string} sourceFile the input object file
     * @param {string} outputFile the output binary
     * @param {Object} linkerOptions additional linker options
     * @param {string} linkerOptions.triple target triple.
     * @return {Promise} Resolves when finished
     */
    async ld(sourceFile, outputFile, { triple }) {
        return new Promise(async (resolve, reject) => {
            let linker, linkerName;

            if (this.linker) {
                const linkerClass = linkers[this.linker];

                if (!linkerClass) {
                    this.error.cli(`VSL has no linker \`${this.linker}\``);
                }

                linker = new linkerClass();

                linkerName = await linker.getCommandName();
                if (!linkerName) {
                    this.error.cli(`Linker \`${this.linker}\` is not installed (${this.linker.names.map(item => `\`${item}\``).join(', ')})`);
                }

                if (!await linker.check()) {
                    this.error.cli(`Linker \`${this.linker}\` is not supported on your environment.`);
                }
            } else {
                linker = await findDefaultLinker(this.error);
                linkerName = await linker.getCommandName();
            }

            const ldArgs = await linker.getArgumentsForLinkage({
                triple: new Triple(triple),
                files: [
                    sourceFile
                ],
                libraries: [
                    ...this.libraries
                ],
                output: outputFile,
                enableLTO: this.enableLTO,
                errorManager: this.error
            });

            ldArgs.push(...this.linkerArgs);

            this.printLog(`$ ${linkerName} ${ldArgs.join(" ")}`);

            let ld = spawn(linkerName, ldArgs, {
                stdio: ['ignore', 'inherit', 'inherit']
            });

            ld.on('error', (error) => {
                switch (error.code) {
                    case "ENOENT":
                        this.error.cli(`failed: could not locate linker \`(${this.linker})\`.`);
                    default:
                        this.error.cli(`failed: ${error.message} (${error.code})`);
                }
            });

            ld.on('exit', (errorCode) => {
                if (errorCode === 0) {
                    resolve();
                } else {
                    this.error.cli(`failed: ${linker.name}: exited with ${errorCode}`);
                }
            })
        });
    }

    /**
     * Optimizes input LLVM and returns stream.
     * @param {string} byteCode - LLVM IR input
     * @param {Object} opts
     * @param {string} opts.triple - Triple
     * @param {number} opts.optLevel - optimization type
     * @param {boolean} opts.emitByteCode - If IR should be emitted
     * @return {Promise<string>} Promise evaluating to string of STDOUT
     * @async
     */
    opt(byteCode, {
        triple = "",
        optLevel = "2",
        emitByteCode = false,
        redirect = null
    }) {
        return new Promise((resolve, reject) => {
            const optArgs = [
                `-mtriple=${triple}`,
                `-O${this.optimizationLevel}`
            ];

            if (emitByteCode) optArgs.push('-S');

            this.printLog(`$ opt ${optArgs.join(" ")}`);

            const opt = spawn('opt', optArgs, {
                stdio: ['pipe', 'pipe', 'inherit']
            });

            if (redirect) opt.stdout.pipe(redirect);
            const didWriteBC = opt.stdin.write(byteCode);

            if (didWriteBC) {
                opt.stdin.end();
            } else {
                opt.stdin.on('drain', () => {
                    opt.stdin.end();
                })
            }

            opt.on('exit', (errorCode) => {
                if (errorCode !== 0) {
                    reject();
                    this.error.cli(`failed: opt: exited with ${errorCode}`);
                } else {
                    if (redirect) resolve();
                }
            });

            if (!redirect) resolve(opt.stdout);
        });
    }

    /**
     * Compiles using LLC
     * @param {stream.Readable|string} byteCode byte code from llvm or stream.
     * @param {string} outputFile output .s file.
     * @param {Object} compilationOptions other compilation options
     * @param {string} compilationOptions.triple Target triple
     * @param {string} compilationOptions.optLevel 0-3
     * @return {Promise} If succesful. output file is `.s` with correct infno.
     */
    llc(byteCode, outputFile, {
        triple = "",
        type = "obj"
    } = {}) {
        return new Promise((resolve, reject) => {
            const llcArgs = [
                `-mtriple=${triple}`,
                `-filetype=${type}`,
                `-o=${outputFile}`,
                `-x=ir`
            ].concat(this.llcArgs);

            this.printLog(`$ llc ${llcArgs.join(" ")}`);

            // Spawn LLC compiler. Pass target option
            let llc = spawn('llc', llcArgs, {
                stdio: ['pipe', 'inherit', 'inherit']
            });

            llc.on('error', (error) => {
                switch (error.code) {
                    case "ENOENT":
                        this.error.cli(`failed: could not locate llc binary.`);
                    default:
                        this.error.cli(`failed: ${error.message} (${error.code})`);
                }
            });

            if (typeof byteCode === 'string') {
                let didWriteBC = llc.stdin.write(byteCode);
                if (didWriteBC) {
                    llc.stdin.end();
                } else {
                    llc.stdin.on('drain', () => {
                        llc.stdin.end();
                    })
                }
            } else {
                byteCode.pipe(llc.stdin);
            }

            llc.on('exit', (errorCode) => {
                if (errorCode === 0) {
                    resolve();
                } else {
                    this.error.cli(`failed: llc: exited with ${errorCode}`);
                }
            })
        });
    }

    _lastCompColor = 0
    _colorCompilationStep(from, to) {
        let str, lastColor = this._lastCompColor;

        let colors = ['1', '1;33', '1;32', '1;34', '1;35']
        let oldColor = colors[this._lastCompColor % colors.length];
        let nextColor = colors[++this._lastCompColor % colors.length];

        if (this.color) {
            str = `\u001B[${oldColor}m${from}\u001B[0m -> \u001B[${nextColor}m${to}\u001B[0m`;
        } else {
            str = `${from} -> ${to}`;
        }
        console.log(str);
    }

    postCompilation(compilationGroup) {
        if (this.perfBreakdown) {
            console.log(prettyPrintPerformance(compilationGroup.context.benchmarks));
        }
    }

}
