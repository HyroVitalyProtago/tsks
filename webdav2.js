// adapted from https://github.com/aslakhellesoy/webdavjs/
// A raw WebDAV interface

/*
// TODO async/await with promises
// constructor with authentication
// based on fetch instead of XMLHttpRequest?
const db = new WebDAV('http://192.168.1.5/webdav/', {
  username: "test",
  password: "test"
});
db.catch(err => console.error(err));
db.file('readme.md').read().then(content => console.log)
                    .write(content)
                    .rm()
const content = await db.file('readme.md').read();
db.dir('obsidian').mkdir()
                  .rm()
                  .children()


// json
const data = db.file('data.json');
const content = JSON.parse(await data.read());
content.key = value;
await data.write(JSON.stringify(content));

// markdown
- [ ]
const data = db.file('tasks.md');
const content = await data.read();
const tasks = [...content.matchAll(/^\- \[([ x])\] (.*)$/g)]
console.log(tasks)
*/

class WebDAV {
  constructor(root, args) {
    this.root = root;
    this.headers = {"Content-Type": "text/xml; charset=UTF-8"};
    if (args.username && args.password) {
      this.headers["Authorization"] = "Basic "+btoa(args.username+":"+args.password);
    }
    this.errListeners = [];
  }

  catch(listener) {
    this.errListeners.push(listener);
  }

  file(path, metadata) {
    return new File(this, path, metadata);
  }

  dir(path, metadata) {
    return new Dir(this, path, metadata);
  }

  fetch(url, args) {
    const init = {mode: 'cors', ...args};
    init.headers = new Headers(this.headers);
    for (const key in args.headers) {
      init.headers.append(key, args.headers[key]);
    }
    return fetch(url, init).catch(err => this.errListeners.forEach(listener => listener(err)));
  }
}

function urlFor(root, url) {
  if (!url) return root;
  return (/^http/.test(url) ? url : root + url);
};

function nameFor(url) {
  return url.replace(/.*\/(.*)/, '$1');
};

class File {
  constructor(webdav, path, metadata) {
    path = decodeURI(path);
    this.webdav = webdav;
    this.url = urlFor(webdav.root, path);
    this.name = nameFor(path);
    this.metadata = metadata;
  }
  async exist() {
    try {
      await this.read(args);
      return true; // file exist
    } catch(e) {
      return false;
    }
  }
  read(args) { // read text by default
    return this.webdav.fetch(this.url, {method: 'GET', ...args}).then(res => res.text());
  }
  json(args) {  // read json by default
    return this.webdav.fetch(this.url, {method: 'GET', ...args}).then(res => res.json());
  }
  write(data, args) {
    return this.webdav.fetch(this.url, {method: 'PUT', body:data, ...args});
  }
  rm(args) {
    return this.webdav.fetch(this.url, {method: 'DELETE', ...args});
  }
  copy(desturl, args) {
    return this.webdav.fetch(this.url, {method: 'COPY', headers:{"Destination":desturl, "Depth":'infinity'}, ...args});
  }
  move(desturl, args) {
    return this.webdav.fetch(this.url, {method: 'MOVE', headers:{"Destination":desturl, "Depth":'infinity'}, ...args})
      .then(ret => {
        this.url = desturl;
        this.name = nameFor(this.url);
        return ret;
      });
  }
}

class Dir {
  constructor(webdav, path, metadata) {
    path = decodeURI(path);
    this.webdav = webdav;
    this.url = urlFor(webdav.root, path);
    this.name = nameFor(path);
    this.metadata = metadata;
  }
  children(args) {
    const webdav = this.webdav;
    const rootUrl = webdav.root;
    return webdav.fetch(this.url, {method: 'PROPFIND', headers: {Depth: '1'}, ...args})
      .then(response => response.text())
      .then(str => new DOMParser().parseFromString(str, 'text/xml'))
      .then(xml => xml.firstChild.nextSibling ? xml.firstChild.nextSibling : xml.firstChild)
      .then(doc => {
        // console.log(doc);
        if (doc.children == null) {
          throw('No such directory: ' + rootUrl);
        }
        const result = [];
        // Start at 1, because the 0th is the same as self.
        for(let i=1; i< doc.children.length; i++) {
          const response = doc.children[i];
          let href = response.getElementsByTagNameNS('DAV:','href')[0].firstChild.nodeValue;
          // remove dirs from rootUrl
          // /webdav/apps - http://192.168.1.5/webdav/ => apps
          // TODO check if it works when root url not have dirs
          const dirsRootUrl = rootUrl.replace(/[^\/]*\/\/[^\/]*/, '');
          href = href.replace(new RegExp('^'+dirsRootUrl), '');
          href = href.replace(/\/$/, ''); // Strip trailing slash
          const propstat = response.getElementsByTagNameNS('DAV:','propstat')[0];
          const prop = propstat.getElementsByTagNameNS('DAV:','prop')[0];
          const resourcetype = prop.getElementsByTagNameNS('DAV:','resourcetype')[0];
          const collection = resourcetype.getElementsByTagNameNS('DAV:','collection')[0];

          const creationdate = new Date(prop.getElementsByTagNameNS('DAV:','creationdate')[0].textContent);
          const getlastmodified = new Date(prop.getElementsByTagNameNS('DAV:','getlastmodified')[0].textContent);
          const getetag = prop.getElementsByTagNameNS('DAV:','getetag')[0].textContent.replaceAll('"', '');
          const metadata = {
            creationdate: creationdate,
            lastmodified: getlastmodified,
            etag: getetag
          };

          if (collection) {
            result.push(webdav.dir(href, metadata));
          } else {
            const getcontentlength = Number.parseInt(prop.getElementsByTagNameNS('DAV:','getcontentlength')[0].textContent);

            result.push(webdav.file(href, {
              ...metadata,
              contentlength: getcontentlength
            }));
          }
        }
        return result;
      });
  }
  mkdir(args) {
    return this.webdav.fetch(this.url, {method: 'MKCOL', ...args});
  }
  rm(args) {
    return this.webdav.fetch(this.url, {method: 'DELETE', ...args});
  }
  copy(desturl, args) {
    return this.webdav.fetch(this.url, {method: 'COPY', headers:{"Destination":desturl, "Depth":'infinity'}, ...args});
  }
  move(desturl, args) {
    return this.webdav.fetch(this.url, {method: 'MOVE', headers:{"Destination":desturl, "Depth":'infinity'}, ...args});
  }
}

const template = document.createElement('template');
template.innerHTML = `
<style>
#webdav-form {
  position: absolute;
  top:15px;
  right:15px;
  display: flex;
  flex-direction: column;
  background: white;
  padding: 12px;
  border-radius: 8px;
}
#webdav-form form {
  display: flex;
  flex-direction: column;
}
#webdav-form *:not(:first-child) {
  margin-top: 4px;
}
</style>
<div id="webdav-form">
  <form autocomplete="on">
    <input type="text" id="host" name="host" placeholder="host"/>
    <input type="text" id="username" name="username" placeholder="username"/>
    <input type="password" id="password" name="password" placeholder="password"/>
  </form>
  <button>Connect</button>
</div>
`;
customElements.define('webdav-form', class extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open'});
    this.shadowRoot.appendChild(template.content.cloneNode(true));
    this.shadowRoot.querySelector('button').addEventListener('click', () => this.connect());
    this.shadowRoot.querySelector('#password').addEventListener('keypress', (e) => {
      if (e.keyCode == 13) { // ENTER
        this.connect();
        return true;
     }
    });
    this.connectEvent = new CustomEvent('connect', {bubbles: true, cancelable: false, composed: true});
    
    // auto connect
    const host = sessionStorage.getItem('host');
    const username = sessionStorage.getItem('username');
    const password = sessionStorage.getItem('password');
    if (host && username && password) {
      this.shadowRoot.querySelector('#host').value = host;
      this.shadowRoot.querySelector('#username').value = username;
      this.shadowRoot.querySelector('#password').value = password;
      this.connect();
    }
  }

  connect() {
    const host = this.shadowRoot.querySelector('#host').value;
    const username = this.shadowRoot.querySelector('#username').value;
    const password = this.shadowRoot.querySelector('#password').value;
    
    this.fs = new WebDAV(host, {username: username, password: password});
    // TODO check if connexion is OK

    this.shadowRoot.querySelector('#webdav-form').style.display = 'none';

    // https://security.stackexchange.com/questions/36958/is-it-safe-to-store-password-in-html5-sessionstorage
    // TL;DR not completly secure
    sessionStorage.setItem('host', host);
    sessionStorage.setItem('username', username);
    sessionStorage.setItem('password', password);

    this.dispatchEvent(this.connectEvent);
    this.isRemoteConnected = true;
  }
});