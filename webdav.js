// adapted from https://github.com/aslakhellesoy/webdavjs/
// check https://github.com/play-co/webdavjs/blob/master/src/webdav.js
// A raw WebDAV interface

var WebDAV = {
  GET: function(url, callback) {
    return this.request('GET', url, {}, null, 'text', callback);
  },

  PROPFIND: function(url, callback) {
    return this.request('PROPFIND', url, {Depth: "1"}, null, 'xml', callback);
  },

  MKCOL: function(url, callback) {
    return this.request('MKCOL', url, {}, null, 'text', callback);
  },
  
  DELETE: function(url, callback) {
    return this.request('DELETE', url, {}, null, 'text', callback);
  },

  PUT: function(url, data, callback) {
    return this.request('PUT', url, {}, data, 'text', callback);
  },
  
  COPY: function(url, desturl, callback) {
	  return this.request('COPY',url, {"Destination":desturl, "Depth":'infinity'}, null, 'text', callback);
  },

  MOVE: function(url, desturl, callback) {
	  return this.request('MOVE',url, {"Destination":desturl, "Depth":'infinity'}, null, 'text', callback);
  },
  
  request: function(verb, url, headers, data, type, callback) {
    var xhr = new XMLHttpRequest();
    var body = function() {
      var b = xhr.responseText;
      if (type == 'xml') {
        var xml = xhr.responseXML;
        if(xml) {
          b = xml.firstChild.nextSibling ? xml.firstChild.nextSibling : xml.firstChild;
        }
      }
      return b;
    };
    
    if(callback) {
      xhr.onreadystatechange = function() {
        if(xhr.readyState == 4) { // complete.
          var b = body();
          if(b) {
            callback(b);
          }
        }
      };
    }
    
    xhr.open(verb, url, !!callback);
    
    // if (data)
    xhr.setRequestHeader("Content-Type", "text/xml; charset=UTF-8");
    
    if (WebDAV.username && WebDAV.password) {
      xhr.setRequestHeader("Authorization", "Basic "+btoa(WebDAV.username+":"+WebDAV.password));
    }
    
    for (var header in headers) {
      xhr.setRequestHeader(header, headers[header]);
    }
    xhr.send(data);

    if(!callback) {
      return body();
    }
  }
};

// An Object-oriented API around WebDAV.
WebDAV.Fs = function(rootUrl) {
  this.rootUrl = rootUrl;
  var fs = this;
  
  this.file = function(href) {
    this.type = 'file';

    this.url = fs.urlFor(href);

    this.name = fs.nameFor(this.url);

    this.read = function(callback) {
      return WebDAV.GET(this.url, callback);
    };

    this.write = function(data, callback) {
      return WebDAV.PUT(this.url, data, callback);
    };

    this.rm = function(callback) {
      return WebDAV.DELETE(this.url, callback);
    };
    
    //Copy: callback will receive the new file/dir object or undefined if error occurs with xhr object to fetch details
		this.copy = function(desturl, callback) {
		  return WebDAV.COPY(this.url, fs.urlFor(desturl), function(body,error,xhr) {
			  callback(error ? undefined : fs[this.type](desturl),xhr);
		  });
		}

		this.move = function(desturl, callback) {
		  return WebDAV.MOVE(this.url, fs.urlFor(desturl), function(body,error,xhr) {
			  callback(error ? undefined : fs[this.type](desturl),xhr);
		  });
		}

    return this;
  };
  
  this.dir = function(href) {
    this.type = 'dir';

    this.url = fs.urlFor(href);

    this.name = fs.nameFor(this.url);

    this.children = function(callback) {
      var childrenFunc = function(doc) {
        if(doc.children == null) {
          throw('No such directory: ' + rootUrl);
        }
        var result = [];
        // Start at 1, because the 0th is the same as self.
        for(var i=1; i< doc.children.length; i++) {
          var response     = doc.children[i];
          var href         = response.getElementsByTagNameNS('DAV:','href')[0].firstChild.nodeValue;
          
          // remove dirs from rootUrl
          // /webdav/apps - http://192.168.1.5/webdav/ => apps
          // TODO check if it works when root url not have dirs
          const dirsRootUrl = rootUrl.replace(/[^\/]*\/\/[^\/]*/, '');
          href = href.replace(new RegExp('^'+dirsRootUrl), '');
          href = href.replace(/\/$/, ''); // Strip trailing slash
          var propstat     = response.getElementsByTagNameNS('DAV:','propstat')[0];
          var prop         = propstat.getElementsByTagNameNS('DAV:','prop')[0];
          var resourcetype = prop.getElementsByTagNameNS('DAV:','resourcetype')[0];
          var collection   = resourcetype.getElementsByTagNameNS('DAV:','collection')[0];

          if (collection) {
            result.push(new fs.dir(href));
          } else {
            result.push(new fs.file(href));
          }
        }
        return result;
      };

      if (callback) {
        WebDAV.PROPFIND(this.url, function(doc) {
          callback(childrenFunc(doc));
        });
      } else {
        return childrenFunc(WebDAV.PROPFIND(this.url));
      }
    };

    this.rm = function(callback) {
      return WebDAV.DELETE(this.url, callback);
    };

    this.mkdir = function(callback) {
      return WebDAV.MKCOL(this.url, callback);
    };
    
    //Copy: callback will receive the new file/dir object or undefined if error occurs with xhr object to fetch details
		this.copy = function(desturl, callback) {
		  return WebDAV.COPY(this.url, fs.urlFor(desturl), function(body,error,xhr) {
			  callback(error ? undefined : fs[this.type](desturl),xhr);
		  });
		}

		this.move = function(desturl, callback) {
		  return WebDAV.MOVE(this.url, fs.urlFor(desturl), function(body,error,xhr) {
			  callback(error ? undefined : fs[this.type](desturl),xhr);
		  });
		}

    return this;
  };
  
  this.urlFor = function(href) {
    if (!href) return this.rootUrl;
    return (/^http/.test(href) ? href : this.rootUrl + href);
  };
  
  this.nameFor = function(url) {
    return url.replace(/.*\/(.*)/, '$1');
  };

  return this;
};

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
    
    WebDAV.username = username;
    WebDAV.password = password;
    
    this.fs = new WebDAV.Fs(host);
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