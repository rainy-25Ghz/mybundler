const fs = require('fs')
const path = require('path')
const babylon = require('babylon')// AST解析器
const traverse = require('babel-traverse').default // 遍历ast
const { transformFromAst } = require('babel-core') // babel-core

let ID = 0

/**
 *  获得文件內容， 從而在下面做語法樹分析
 * @param {*} filename
 */
function createAsset(filename) {
    const content = fs.readFileSync(filename, 'utf-8')
    const ast = babylon.parse(content, { // 解析内容至AST
        sourceType: 'module'
    })

    const dependencies = [] // 初始化依赖 dependencies存放該文件依賴項的相對path

    traverse(ast, { // 聲明traverse的statement， 這裏進ImportDeclaration 這個statement內。然後對節點import的依賴值進行push進依賴集
        ImportDeclaration: ({ node }) => {
            dependencies.push(node.source.value)
        }
    })

    const id = ID++ // id自增

    const { code } = transformFromAst(ast, null, { // 再將ast轉換爲文件
        presets: ['env']
    })

    // 返回這麼模塊的所有信息，設置的id filename 依賴集 代碼
    return {
        id,
        filename,
        dependencies,
        code
    }
}

/**
 *從entry入口進行解析依賴圖譜
 * @param {*} entry
 */
function createGraph(entry) {
    const mainAsset = createAsset(entry) // 從入口文件開始
    const queue = [mainAsset] // 最初的依賴集

    for (const asset of queue) { // 一張圖常見的遍歷算法有廣度遍歷與深度遍歷,這裏採用的是廣度遍歷
        asset.mapping = {} // 給當前依賴做mapping記錄
        const dirname = path.dirname(asset.filename)// 獲得依賴模塊地址
        asset.dependencies.forEach(relativePath => { // 剛開始只有一個asset 但是dependencies可能多個
            const absolutePath = path.join(dirname, relativePath)// 這邊獲得絕對路徑
            const child = createAsset(absolutePath) // 遞歸依賴的依賴
            asset.mapping[relativePath] = child.id // 將當前依賴及依賴的依賴都放入到mappnig裏
            queue.push(child) // 廣度遍歷藉助隊列
        })
    }

    return queue // 返回遍歷完依賴的隊列
}

/**
 * 將graph模塊打包bundle輸出
 * @param {*} graph
 */
function bundle(graph) {
    let modules = ''
    graph.forEach(mod => {
        modules += `${mod.id}: [
      function (require, module, exports) { ${mod.code} },
      ${JSON.stringify(mod.mapping)},
    ],`
    })

    // CommonJS風格
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