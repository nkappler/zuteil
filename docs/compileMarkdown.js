var hljs = require('highlight.js'),
    md = require('markdown-it')({
        highlight: function (str, lang) {
            if (lang && hljs.getLanguage(lang)) {
                try {
                    return '<pre class="hljs"><code>' +
                        hljs.highlight(lang, str, true).value +
                        '</code></pre>';
                } catch (__) { }
            }

            return ''; // use external default escaping
        }
    }),
    fs = require('fs');

var source = fs.readFileSync("README.md").toString();
var template = fs.readFileSync("./docs/template.html").toString();
var result = template.replace("{{{CONTENT}}}", md.render(source));
result = result.replace(/\/docs\//g, "/"); //fix for local img urls

fs.writeFileSync("./docs/index.html", result);
