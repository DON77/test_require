#!/usr/bin/env node

/// <reference path="../node_modules/@types/node/index.d.ts" />
/// <reference path="../node_modules/@types/object-path/index.d.ts" />

import * as fs from 'fs'
import * as path from 'path'
import * as objectPath from 'object-path'
// declare const module
// declare const require: NodeRequire
// declare function require(moduleName: string): any

export type typeStrings = Array<string>
export type typeObjects = Array<Object>
export type typeNodeModule = NodeModule
export type typeNodeModuleOrPath = typeNodeModule | string

export interface interfaceConfig {
  async?: boolean,
  recurse?: boolean,
  indexProp?: boolean,
  indexName?: string,
  export?: boolean | Function,
  resolve?: Function
  safe?: boolean,
  exclude?: {
    files?: Array<string>,
    self?: boolean,
    parents?: boolean,
    siblings?: boolean,
    children?: boolean,
  },
}

export interface interfaceModuleData {
  props?: typeStrings,
  exports: any,
  filename: string,
  extname: string,
  basename: string,
  path: string
}

export interface interfaceExporter {
  moduleName: string,
  moduleExports: any,
  modulesHash: Object,
  target: typeNodeModuleOrPath,
}

/**
 * @function
 * @param {(module|string)} target - Path of directory with importable JavaScript file-modules specified as string of path to file or to folder, or as Module instance.
 * @param {Object.<string>} [options] - Custom parameters for Requine behaviour.
 * @param {boolean} [options.async] - Require modules asynchronously (not implemented yet)
 * @param {boolean} [options.recurse] - Recurse directories
 * @param {boolean} [options.indexProp] - Index-module as 'index' property
 * @param {string} [options.indexName] - Index-file naming
 * @param {(boolean|function<key, value, data, Module>)} [options.export] - Export root properties of `imports` object as module's exports
 * @param {Object.<string>} [options.exclude] - Files excluding options
 * @param {Array} [options.exclude.files] - Exclude files/dirs by their names
 * @param {boolean} [options.exclude.self] - Exclude this module file
 * @param {boolean} [options.exclude.parents] - Exclude parent modules
 * @param {boolean} [options.exclude.siblings] - Exclude Index-file siblings
 * @param {boolean} [options.exclude.children] - Exclude Index-file children
 * @param {Function} [options.resolve] - Resolve module exports
 * @param {boolean} [options.safe=true] - Whether to provide safe names for exported modules?
 *
 * @return {Object} Imported modules in single object and optionally its properties as module's exports.
 *
 * @example <caption>Example usage of Options.resolve parameter.</caption>
 * const options: Object = {
 *  resolve(){
 *    let modelName = Case.pascal(this.basename)
 *    let schema = this.exports.default({ modelName, Schema: mongoose.Schema })
 *    this.exports = { modelName, schema }
 *    }
 * }
 *
 * @example <caption>Example usage of export function.</caption>
 * const options: Object = {
 *   export({ key, value, data, Module }: { key: string, value: any, data: Object, Module: Object }): void {
 *     let keyCase: string = Case.pascal(key)
 *     // (you can use `value` instead `this`)
 *     Module.exports[keyCase] = this.exports.default
 *   }
 * }
 *
 */
export default function requine(target?: typeNodeModuleOrPath, options?: interfaceConfig): Object {

  /** Reduction of parameters */
  const caller: string = getCallerPath()
  const targetPath: string = getTargetPath({ target, caller })
  const config: interfaceConfig = getConfig(options)

  /** Require modules from target directory. */
  const modulesData: typeObjects = getModulesData(targetPath, config, target)

  /** Combine all required modules to one object. */
  const modulesHash: Object = getModulesHash(modulesData, config)

  /** Export root properties of `imports` object via caller-module instance. */
  exportModules({ modulesHash, target, config })

  /** Return single object of imported and resolved modules. */
  return modulesHash
}

/**
 * Runtime type checker.
 * @param {*} value - The value to check for type matching.
 * @param {string} type - The type to match.
 * @returns {boolean} Match type or not.
 */
function is(value: any, type: string): boolean {
  switch (type.toLowerCase()) {
    case 'dir':
    case 'directory':
    case 'folder':
      return fs.existsSync(value) && fs.statSync(value).isDirectory()
    case 'file':
      return fs.existsSync(value) && fs.statSync(value).isFile()
    case 'undefined':
      return value === void 0
    case 'module':
      return value !== void 0 && value.constructor.name === 'Module'
    default:
      return toString.call(value) === `[object ${type.charAt(0).toUpperCase() + type.slice(1)}]`
  }
}

/**
 * Get target directory path.
 * @param {typeNodeModuleOrPath} target - Path of target directory or file in that dir or Module instance.
 * @returns {string} Path of target directory/file.
 */
function getTargetPath({ target, caller }: {target?: typeNodeModuleOrPath, caller: string }): string {

  /** Get directory path from caller module if `target` is undefined. */
  if (is(target, 'undefined')) {
    return getCallerPath()
  }

  /** Get directory path from caller module if `target` is instance of Module. */
  if (is(target, 'Module')) {
    return path.dirname((<typeNodeModule>target).filename)
  }

  /** Get directory path from string if `target` is string of path. */
  if (
    is(<typeNodeModuleOrPath>target, 'string') && (<string>target).length > 0
  ) {
    const targetResolved: string = path.resolve(path.dirname(<string>caller), <string>target)
    if (
      is(<string>targetResolved, 'dir')
      || is(<string>targetResolved, 'file')
    ) {
      return targetResolved
    }
  }

  /** Error if target-string not existing file or directory path. */
  throw new Error('Target must be path to existing file or directory once it`s defined as string.')
}

/**
 * Get Requine config from options parameter and defaults.
 * @param {Options} [options] -
 * @returns {Options}
 */
function getConfig(options?: interfaceConfig): interfaceConfig {

  /** Clone options object if defined otherwise empty. */
  let config: interfaceConfig = is(options, 'object') ? { ...options } : {}

  /** Define default value for each option, if not specified or incorrect type. */
  config.async = is(config.async, 'boolean') ? config.async : true
  config.recurse = is(config.recurse, 'boolean') ? config.recurse : true
  config.indexProp = is(config.indexProp, 'boolean') ? config.indexProp : false
  config.indexName = is(config.indexName, 'string') ? config.indexName.trim() : 'index'
  config.export = (is(config.export, 'boolean') || is(config.export, 'function')) ? config.export : false
  config.resolve = is(config.resolve, 'function') ? config.resolve : null
  config.safe = is(config.safe, 'boolean') ? config.safe : false

  config.exclude = is(config.exclude, 'object') ? config.exclude : {}
  config.exclude.files = !is(config.exclude.files, 'undefined') ? config.exclude.files : null
  config.exclude.self = is(config.exclude.self, 'boolean') ? config.exclude.self : true
  config.exclude.parents = is(config.exclude.parents, 'boolean') ? config.exclude.parents : true
  config.exclude.siblings = is(config.exclude.siblings, 'boolean') ? config.exclude.siblings : true
  config.exclude.children = is(config.exclude.children, 'boolean') ? config.exclude.children : true

  /** Returns the normalized config object. */
  return config
}

/**
 * Get file-paths of parent modules of Module instance.
 * @param {typeNodeModule} nodeModule - Node module instance.
 * @param {typeStrings} parents=[] - Parent-modules file-paths.
 * @returns {typeStrings} Parent-modules file-paths.
 */
function getParents(nodeModule: typeNodeModule, parents: typeStrings = []): typeStrings {

  /** Add file-path of parent-module to function results. */
  if (is((<typeNodeModule>nodeModule).parent.filename, 'string')) {
    parents.push(nodeModule.parent.filename)
  }

  /** Recurse if parent-module has parent. */
  if (!is((<typeNodeModule>nodeModule).parent.parent, 'null')) {
    return getParents(nodeModule.parent, parents)
  }

  /** Return array of parent-modules file-paths. */
  return parents
}

/**
 * Require modules from target directory.
 * @param {string} targetPath - Path of target directory.
 * @param {interfaceConfig} config -
 * @param {typeNodeModuleOrPath} target -
 * @param {typeStrings} props=[] -
 * @returns {typeObjects}
 */
 function getModulesData(targetPath: string, config: interfaceConfig, target: typeNodeModuleOrPath, props: typeStrings = []): typeObjects {

  /** Get files and folders list from current directory otherwise use filepath. */
  const items: typeStrings = is(targetPath, 'dir')
    ? fs.readdirSync(targetPath)
    : [targetPath]

  /** Prepare storage for imported modules */
  const modulesData: Array<interfaceModuleData> = []

  /** Process each item in directory. */
  Promise.all(
    [items.forEach((pathname: string) => {
      new Promise(async function (resolve, reject) {
      
        /** Resolve and qualify path. */
        let itempath: string = path.resolve(targetPath, pathname)

        /** Break loop if path isn't directory or file. */
        if (!is(itempath, 'file') && !is(itempath, 'dir')) {
          return void 0
        }

        /** ### Exclude directory and files by next rules. */

        /** Exclude this Requine-module file. */
        if (
          config.exclude.self === true
          && require.main.filename === itempath
        ) {
          return void 0
        }

        /** Exclude caller-module file. */
        if (
          is(target, 'Module')
          && (<typeNodeModule>target).filename === itempath
        ) {
          return void 0
        }

        /** Exclude parent modules. */
        if (
          config.exclude.parents === true
          && getParents(<typeNodeModule>module).includes(itempath)
        ) {
          return void 0
        }

        /** Drilldown if current item is directory. */
        if (
          is(itempath, 'dir')
          && config.recurse === true
        ) {
          return getModulesData(itempath, config, target, props.concat([pathname]))
        }

        /** Require module since it file. */
        let exports: Object = require(itempath)

        /** Exclude exports which is `undefined` */
        if (is(exports, 'undefined')) {
          return void 0
        }

        /** Construct module data in object. */
        const moduleData: interfaceModuleData = {
          props,
          exports,
          filename: pathname,
          extname: path.extname(pathname),
          basename: path.basename(pathname, path.extname(pathname)),
          path: itempath
        }

        /** Resolve module data in its context and /w data-parameter fallback. */
        if (is(config.resolve, 'function')) {
          config.resolve.apply(moduleData, moduleData)
        }

        /** Save module data to common array. */
        await modulesData.push(moduleData)
        resolve(modulesData);
      })
    })]
  ).then(() => {
    return modulesData
  });
  return modulesData
}

/**
 * Combine all required modules to one object.
 *
 * @param {typeObjects} modulesData
 * @param {interfaceConfig} config
 *
 * @returns {Object}
 */
function getModulesHash(modulesData: typeObjects, config: interfaceConfig): Object {
  // console.log('config.indexProp', config.indexProp)

  /** Prepare storage for modules. */
  let modulesHash: Object = {}

  /** Process each imported module. */
  if (Array.isArray(modulesData)) {
    modulesData.forEach(({ props, filename, basename, path: modulePath, extname, exports: moduleExports }: interfaceModuleData) => {

      /** Get object property path. */
      let propsPath: typeStrings = (
        basename === config.indexName
        && config.indexProp === false
      )
        ? props
        : props.concat([basename])

      /** Exclude all siblings for index file if `indexProp === false` and modules array includes index filename. */
      let indexPath: string = path.join(path.dirname(modulePath), `/${config.indexName}${extname}`)
      if (
        config.indexProp === false
        && basename !== config.indexName
        && config.exclude.siblings === true
        && modulesData.some(({ path }: { path: string }) => indexPath === path)
      ) {
        return void 0
      }

      /** Rebuild prop for siblings if `indexProp === false`. */
      /** If index-module not as 'index' property and `modulesHash` object has `propsPath`. */
      if (
        objectPath.has(modulesHash, propsPath)
        && config.indexProp === false
      ) {
        /** Get source prop from Imports. */
        let moduleData: Object = objectPath.get(modulesHash, propsPath)
        /** Reassign source prop if. */
        moduleData = basename === config.indexName
          ? Object.assign(moduleExports, moduleData)
          : Object.assign(moduleData, { [basename]: moduleExports })
        setObjectPath(modulesHash, propsPath, moduleData)
        return void 0
      }


      /** Assign exports by props-path */
      setObjectPath(modulesHash, propsPath, moduleExports)

    })
  }

  return modulesHash

}

/**
 * Sets value to the data object by properties-path.
 * @function
 * @param {Object} modulesHash
 * @param {typeStrings} propsPath
 * @param {Object} moduleExports
 * @return {void}
 * */
function setObjectPath(modulesHash: Object, propsPath: typeStrings, moduleExports: Object) {
  propsPath.length > 0
    ? objectPath.set(modulesHash, propsPath, moduleExports)
    : modulesHash = moduleExports
}

/**
 * Export root properties of `imports` object via caller-module instance.
 * @param {{ modulesHash: Object, target: typeNodeModuleOrPath, config: interfaceConfig }} { modulesHash, target, config }
 */
function exportModules({ modulesHash, target, config }: { modulesHash: Object, target: typeNodeModuleOrPath, config: interfaceConfig }) {

  /** Effective exporter function. */
  const exporter: Function | boolean = is(config.export, 'function')
    ? config.export
    : exporterByDefault

  /** Export each root property of JSON data if conditions are satisfactory for export. */
  if (isExportableData()) exportEach()

  /** Check that the conditions are satisfactory for export.
   * @return {boolean} Satisfactory or not.
   * */
  function isExportableData(): boolean {
    let keys: typeStrings = Object.keys(modulesHash)
    return (
      /** Module is the instance of Module constructor */
      is(target, 'Module')
      /** Data is non-empty JSON */
      && is(modulesHash, 'Object') && keys.length > 0
      /** At least one of the JSON values is defined. */
      && keys.some((key: string) => !is(key, 'undefined'))
      /** Export is allowed. */
      && (config.export === true || is(config.export, 'function'))
    )
  }

  /** Check that the key and value is exportable.
   * @return {boolean} Exportable or not.
   * */
  function isExportableItem(moduleName: string, modulesHash: Object): boolean {
    return (
      /** Key is string. */
      is(moduleName, 'string')
      /** Value isn't undefined. */
      && !is(modulesHash[moduleName], 'undefined')
    )
  }

  /** Export each root property of JSON data. */
  function exportEach(): void {
    for (let moduleName in modulesHash) {

      /** Get exports of module by it name from `modulesHash`. */
      let moduleExports: any = modulesHash[moduleName]

      /** Get safe name of `moduleName` in JS reserved keywords context. */
      if (config.safe === true) {
        moduleName = getSafeVarName(moduleName)
      }

      /** Get unique name of `moduleName` in `modulesHash` root properties context. */
      moduleName = getSafePropName(moduleName, modulesHash)

      if (isExportableItem(moduleName, modulesHash)) {
        (<Function>exporter)({ moduleName, moduleExports, modulesHash, target })
      }
    }
  }

  /** Just export current value by default. */
  function exporterByDefault({ moduleName, moduleExports, modulesHash, target }: interfaceExporter): void {
    (<typeNodeModule>target).exports[moduleName] = this
  }


}

/** Returns the safe name of a variable in JS reserved keywords context.
 * @function
 * @param {string} varName - Name of a variable.
 * @return {string} Safe name of a variable.
 * */
function getSafeVarName(varName: string): string {

  /** Predefined list of reserved keywords in JavaScript. */
  const reservedWords: typeStrings = ['abstract', 'arguments', 'await', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do', 'double', 'else', 'enum', 'eval', 'export', 'extends', 'false', 'final', 'finally', 'float', 'for', 'function', 'goto', 'if', 'implements', 'import', 'in', 'instanceof', 'int', 'interface', 'let', 'long', 'native', 'new', 'null', 'package', 'private', 'protected', 'public', 'return', 'short', 'static', 'super', 'switch', 'synchronized', 'this', 'throw', 'throws', 'transient', 'true', 'try', 'typeof', 'var', 'void', 'volatile', 'while', 'with', 'yield',]

  /** Capitalize first letter of `moduleName` is it's a reserved word. */
  return reservedWords.includes(varName)
    ? varName.charAt(0).toUpperCase() + varName.slice(1)
    : varName
}

/** Returns the unique name of a property in object's root properties context.
 * @param {string} propName - Original name of a property.
 * @param {Object} obj - Object.
 * @return {string} Unique name of a property.
 * */
function getSafePropName(propName: string, obj: Object): string {

  /** Uniquely safe `moduleName` by sequential index in the context of `modulesHash`. */
  let safePropName: string = `${propName}${this.moduleNameIndex}`
  this.index = this.index || 1
  this.index++

  let uniqueVarName: string = obj.hasOwnProperty(propName)
    ? obj.hasOwnProperty(safePropName)
      ? getSafePropName(propName, obj)
      : safePropName
    : propName

  delete this.index
  return uniqueVarName
}

/** Returns filepath of Requine-caller module.
 * @return {string} Filepath of Requine-caller module.
 * */
function getCallerPath(): string {
  let pst, stack, file, frame

  pst = Error.prepareStackTrace
  Error.prepareStackTrace = (_, stack) => {
    Error.prepareStackTrace = pst
    return stack
  }

  stack = (new Error()).stack.slice(2)

  do {
    frame = stack.shift()
    file = frame && frame.getFileName()
  } while (stack.length && file === 'module.js')

  return file
}
