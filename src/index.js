/** jud-previewer
* a tool help user to preview their jud files
* version 0.9.1
* example : preview(args);
* args Object
* entry: input file
* folder: file directory
* port: speccify the web server port (0-65336)
* wsport: speccify the websocket server port (0-65336)
**/

const fs = require('fs');
const fse = require('fs-extra');
const npmlog = require('npmlog');
const builder = require('jud-builder');
const path = require('path');
const os = require('os');
const helper = require('./libs/helper');
const server = require('./libs/server');

const JUD_TMP_DIR = '.jud_tmp';

const defaultParams = {
  entry: '',
  folder: '',
  output: '',
  fileExt: ['vue', 'ju'],
  temDir: path.join(os.homedir(), JUD_TMP_DIR),
  port: '8081',
  host: '127.0.0.1',
  wsport: '8082',
  open: true
};

const Previewer = {
  init: function (args) {
    // old jud-previewer compatible
    if (args['_'] && args['_'].length > 0 && !args.entry) {
      args.entry = args['_'][0];
    } else if (Array.isArray(args['_'])) {
      if (fs.lstatSync(args['_'][0]).isDirectory()) {
        args.folder = args['_'][0];
      }
    }
    if (!helper.checkEntry(args.entry)) {
      return npmlog.error('Not a ".vue" or ".we" file');
    }
    if (args.port <= 0 || args.port >= 65336) {
      this.params.port = 8081;
    }
    this.params = Object.assign({}, defaultParams, args);
    this.params.source = this.params.folder || this.params.entry;
    this.file = path.basename(this.params.entry);
    this.fileType = helper.getFileType(this.file);
    this.module = this.file.replace(/\..+/, '');
    this.fileDir = process.cwd();
    return this.fileFlow();
  },
  fileFlow() {
    this.initTemDir();
    this.buildJSFile(() => {
      this.startServer();
    });
  },
  // build temporary directory for web preview
  initTemDir() {
    if (!fs.existsSync(this.params.temDir)) {
      this.params.temDir = JUD_TMP_DIR;
      fse.mkdirsSync(JUD_TMP_DIR);
      fse.copySync(`${__dirname}/../vue-template/template/`, JUD_TMP_DIR);
    }
    // replace old file
    fse.copySync(`${__dirname}/../vue-template/template/jud.html`, `${this.params.temDir}/jud.html`);
    const vueRegArr = [
      {
        rule: /{{\$script}}/,
        scripts: `
<script src="./assets/vue.runtime.js"></script>
<script src="./assets/jud-vue-render/index.js"></script>
    `
      }
    ];
    const weRegArr = [
      {
        rule: /{{\$script}}/,
        scripts: `
<script src="./assets/jud-html5/jud.js"></script>
    ` }
    ];
    let regarr = vueRegArr;
    if (this.fileType === 'ju') {
      regarr = weRegArr;
    } else {
      this.params.webSource = path.join(this.params.temDir, 'temp');
      if (fs.existsSync(this.params.webSource)) {
        fse.removeSync(this.params.webSource);
      }
      helper.createVueSrc(this.params.source, this.params.webSource);
    }
    helper.replace(path.join(`${this.params.temDir}/`, 'jud.html'), regarr);
  },
  // only for vue previewing on web
  createVueAppEntry() {
    helper.replace(`${this.params.temDir}/app.js`, [
      {
        rule: '{{$module}}',
        scripts: path.join(process.cwd(), this.params.source),
      }
    ], true);
    this.params.entry = this.params.temDir + '/app.js';
  },
  buildJSFile(callback) {
    const self = this;
    const buildOpt = {
      watch: true,
      ext: /\.js$/.test(this.params.entry) ? 'js' : this.fileType
    };
    let source = this.params.entry;
    const dest = this.params.temDir;
    let vueSource = this.params.source;
    if (this.params.folder) {
      source = this.params.folder;
      vueSource = this.params.folder;
      buildOpt.entry = this.params.entry;
    }
    if (this.fileType === 'vue') {
      this.createVueAppEntry();
      if (buildOpt.entry) {
        buildOpt.entry = this.params.entry;
      } else {
        source = this.params.entry;
      }
      this.build(vueSource, dest + '/[name].jud.js', buildOpt, () => {
        npmlog.info('jud JS bundle saved at ' + path.resolve(self.params.temDir));
      }, () => {
        this.createVueAppEntry();
        this.build(this.params.webSource, dest, {
          web: true,
          ext: 'js',
          entry: buildOpt.entry
        }, callback);
      });
      // when you first build
      this.build(this.params.webSource, dest, {
        web: true,
        ext: 'js',
        entry: buildOpt.entry
      }, callback);
    } else {
      this.build(source, dest, buildOpt, callback);
    }
  },
  build(src, dest, opts, buildcallback, watchCallback) {
    builder.build(src, dest, opts, (err, fileStream) => {
      if (!err) {
        if (this.wsSuccess) {
          if (typeof watchCallback !== 'undefined') {
            watchCallback();
          }
          npmlog.info(fileStream);
          server.sendSocketMessage();
        } else {
          buildcallback();
        }
      } else {
        npmlog.error(err);
      }
    });
  },
  startServer() {
    const self = this;
    server.run({
      dir: this.params.temDir,
      module: this.module,
      fileType: this.fileType,
      port: this.params.port,
      wsport: this.params.wsport,
      open: this.params.open,
      wsSuccessCallback() {
        self.wsSuccess = true;
      }
    });
  }
};

module.exports = function (args) {
  Previewer.init(args);
};
