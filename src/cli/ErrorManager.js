import ParserError from '../vsl/parser/parserError';
import ModuleError from '../modules/ModuleError';
import BackendWarning from '../vsl/backend/BackendWarning';
import c from './colorSupport';

/**
 * Manages error handling for VSL
 */
export default class ErrorManager {
    /**
     * You can change the params later
     * @param  {boolean} shouldColor whether output should be colorize
     */
    constructor(shouldColor: boolean) {
        /**
         * Whether output should be colorized
         * @type {boolean}
         */
        this.shouldColor = shouldColor;

        /**
         * prefix to prefix log messages with
         * @type {String}
         */
        this.prefix = "vsl: ";
    }

    /**
     * Prints that the CLI itself had an error
     * @param  {string} message Error message
     */
    cli(message) {
        console.warn(this.prefix + message);
        process.exit(1);
    }

    /**
     * Prints a module error.
     *
     * @param {Module} obj - Module object (before run)
     * @param {ModuleError} error - Error object.
     */
    module(error) {
        const mod = error.module;

        let moduleDescribedName = mod.module.name ? " " + mod.module.name : "";
        let moduleDescribedNameColored = this.shouldColor ?
            `\u001B[1m${moduleDescribedName}\u001B[0m` :
            moduleDescribedName;

        let modulePrefixColor = this.shouldColor ?
            `\u001B[35mModule\u001B[0m` :
            `Module`;

        let modulePrefix = modulePrefixColor + moduleDescribedNameColored + ": ";
        console.warn(this.setRed(this.prefix) + modulePrefix + error.message);
        console.warn(`  module @ ${mod.rootPath}`);
        process.exit(1);
    }

    /**
     * Handles a VSL source error.
     * @param  {Object}  data
     * @param  {boolean} data.error        error message
     * @param  {string}  data.src          source file from error
     * @param  {boolean} [data.exit=false] exit proc or throw?
     */
    handle({ error, src, exit = false } = {}) {
        let fileName = error.stream && error.stream.sourceName ?
                `${error.stream.sourceName}` : "";

        if (!error.position && error.node) error.position = error.node.position || null;

        let position = error.position ? `${error.position.line + 1}:${error.position.column}` : "";
        let location = !(position || fileName) ? "" : ` (${[fileName, position].filter(Boolean).join(":")})`;


        // Check if the node has positional information
        if (error.node) {
            let message = error.message + location;
            let highlight = this._highlight(src, error.node.position);
            if (error instanceof BackendWarning) {
                this.rawWarning(
                    "Warning",
                    message,
                    highlight
                )
            } else {
                this.rawError(
                    error.name || "Compiler Error",
                    message,
                    highlight
                )
            }
        }
        else if (error instanceof ParserError) {
            this.rawError(
                "Syntax Error",
                error.message + location,
                error.position ? this._highlight(src, error.position) : ""
            )
        }
        else {
            throw error;
        }

        if (exit === true) {
            process.exit(1);
        }
    }

    /**
     * Dynamically handles any error or warning. This is the recommended error
     * handling function to call as this will locate sources and generate
     * detailed errors.
     *
     * @param {Error} error
     */
    dynamicHandle(error) {
        if (error instanceof ModuleError) {
            this.module(error);
        }

        // VSL Compilation Errors

        let stream = null;

        if (error.stream) { stream = error.stream }
        else if (error.node) {
            let trackingNode = error.node;
            do {
                if (trackingNode.stream) {
                    stream = trackingNode.stream;
                    break;
                }
            } while(
                trackingNode.rootScope !== true &&
                (trackingNode = trackingNode.parentScope)
            );
        }

        if (stream) {
            error.stream = stream;
            this.handle({
                error,
                src: stream.data,
                exit: false
            });
        } else {
            throw error;
        }
    }

    /** @private */
    _repeat(str, len) {
        let res = "";
        while(len --> 0) res += str;
        return res;
    }

    /** @private */
    _leftPad(str, len) {
        var pad = len - str.length, i = "";
        if (pad <= 0) return str;
        while(pad--) i += " ";
        return i + str;
    }

    /** @private */
    _highlight(code, pos) {
        let lines = code.split(/\r?\n/);

        let startLine = Math.max(0, pos.line - 2);
        let endLine   = Math.min(lines.length - 1, pos.line + 2);

        let prefix = this.setYellow(" | ");
        let lineIndicator = "> ";

        let maxLineLength = (endLine + "").length + 2;
        let res = [];

        for (let i = startLine; i <= endLine; i++) {
            let isLine = i === pos.line ? lineIndicator : "";
            let start = this.setYellow(this._leftPad(`${isLine}${i + 1}`, maxLineLength));

            res.push(start + prefix + lines[i]);
            if (i === pos.line) {
                let carets = this.setYellow(this._repeat("^", pos.length));

                res.push(
                    this._repeat(" ", maxLineLength ) + prefix +
                    this._repeat(" ", pos.column) + carets
                );
            }
        }

        return res.join("\n");
    }

    /** @private */
    setYellow(text) {
        if (!this.shouldColor) return text;
        return `\u001B[${
            c.has16m ?
            "38;2;251;150;51" :
            "33"
        }m${text}\u001B[0m`
    }

    /** @private */
    setEmYellow(text) {
        if (!this.shouldColor) return text;
        return `\u001B[1;33m${text}\u001B[0m`
    }

    /** @private */
    setRed(text) {
        if (!this.shouldColor) return text;
        return `\u001B[1;${
            c.has256 ?
            "38;5;202" :
            "31"
        }m${text}\u001B[0m`
    }

    /**
     * Prints a raw error
     *
     * @param {string} type  String describing type
     * @param {string} title Main overview of error
     * @param {string} data  Following lines
     */
    rawError(type, title, data) {
        process.stderr.write(`${this.setRed(type)}: ${title}\n\n`)
        process.stderr.write(data.replace(/^|\n/g, "$&    ") + "\n\n");
    }

    /**
     * Prints a raw error
     *
     * @param {string} type  String describing type
     * @param {string} title Main overview of error
     * @param {string} data  Following lines
     */
    rawWarning(type, title, data) {
        process.stderr.write(`${this.setEmYellow(type)}: ${title}\n\n`)
        process.stderr.write(data.replace(/^|\n/g, "$&    ") + "\n\n");
    }
}
