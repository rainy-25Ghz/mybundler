const fs = require('fs')
const path = require('path')
const babylon = require('babylon')// AST解析器
const traverse = require('babel-traverse').default // 遍历ast
const { transformFromAst } = require('babel-core') // babel-core

let ID = 0

/**
 *  获得文件內容，解析ast语法树
 * @param {*} filename
 */
function createAsset(filename) {
    const content = fs.readFileSync(filename, 'utf-8')
    const ast = babylon.parse(content, { // 解析内容至AST
        sourceType: 'module'
    })

    const dependencies = [] // 初始化依赖 dependencies存放该文件依赖项的相对path

    //push到dependencies中
    traverse(ast, { 
        ImportDeclaration: ({ node }) => {
            dependencies.push(node.source.value)
        }
    })

    const id = ID++ // id自增

    //再把ast转为commonjs code
    const { code } = transformFromAst(ast, null, { 
        presets: ['env']
    })

    // 返回模块的信息，包括设置的id 文件名 依赖数组 代码
    return {
        id,
        filename,
        dependencies,
        code
    }
}

/**
 *从entry入口解析依赖图
 * @param {*} entry
 */
function createGraph(entry) {
    const mainAsset = createAsset(entry) // 入口文件开始解析模块信息
    const queue = [mainAsset] // 一个队列，存储模块的信息，用于BFS

    for (const asset of queue) { // 广度遍历图
        asset.mapping = {} // 一个map，存储模块依赖的path-->id
        const dirname = path.dirname(asset.filename)// 获得当前模块所在文件夹地址
        asset.dependencies.forEach(relativePath => { 
            const absolutePath = path.join(dirname, relativePath)// 绝对路径
            const child = createAsset(absolutePath) // 创建依赖的模块信息
            asset.mapping[relativePath] = child.id // 存储模块依赖的path-->id
            queue.push(child) // bfs
        })
    }

    return queue // 返回解析后的队列
}

/**
 * 將graph打包
 * @param {*} graph
 */
function bundle(graph) {
    let modules = ''
    //根据依赖图生成模块id-->数组(包含模块代码以及一个path与依赖id的map)
    graph.forEach(mod => {
        modules += `${mod.id}: [
      function (require, module, exports) { ${mod.code} },
      ${JSON.stringify(mod.mapping)},
    ],`
    })

    // CommonJS风格的模块打包
    const result = `
    (function(modules) {
      function require(id) {
        const [fn, mapping] = modules[id];
        function localRequire(name) {
          return require(mapping[name]);
        }
        const module = { exports : {} };
        fn(localRequire, module, module.exports);
        return module.exports;
      }
      require(0);
    })({${modules}})
  `
    return result
}

const graph = createGraph('./example/entry.js');
const result = bundle(graph);
fs.writeFileSync("output.js", result)
console.log(result);