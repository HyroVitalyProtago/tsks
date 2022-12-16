/*const nextIdOf = function(object) {
  return !object ? 0 : Math.max(0, ...Object.keys(object).map(o => parseInt(o, 10))) + 1;
}*/

const Tasks = {
  name: 'tasks',
  builder: function(privateClient, publicClient) {
    
    // check https://github.com/lesion/remotestorage-module-bookmarks/blob/master/index.js for inspiration, interesting state management
    privateClient.declareType('task', {
      "type": "object",
      "properties": {
        "id": { // createdAt
          "type": "string",
          "format": "date-time"
        },
        "title": { "type": "string" },
        "state": { // TODO 'queued', 'opened', 'closed', 'completed'
          "type": "string",
          "default": "queued"
        },
        "updatedAt": {
          "type": "string",
          "format": "date-time"
        }
      },
      "required": [ "id", "title", "state", "updatedAt" ]
    });
    
    const methods = {
      get: (id) => privateClient.getObject(id),
      getAll: () => privateClient.getAll(''),
      create: function(task = {}) {
        //return privateClient.getListing('').then(listing => {
          task.id = new Date().toISOString().replaceAll(/:|\./g,'-');
          task.title = task.title || '';
          task.state = 'queued';
          task.updatedAt = new Date().toISOString();
          return privateClient.storeObject("task", task.id, task)
            .then(() => task);
        //});
      },
      update: function(id, key, value) {
        return privateClient.getObject(id).then(task => {
          if (task[key] == value) return task; // don't update if it's the same
          task[key] = value;
          task.updatedAt = new Date().toISOString();
          return privateClient.storeObject("task", task.id, task)
            .then(() => task);
        });
      },
      updateTitle: function(id, title) {
        return this.update(id, 'title', title);
      },
      updateState: function(id, state) {
        return this.update(id, 'state', state);
      },
      delete: function(id) {
        // TODO Object.values(data.sections).forEach(section => section.content = section.content.filter(tid => tid !== id))
        return privateClient.remove(id);
      },
      on: privateClient.on
    };
    
    return {
      exports: methods
    }
  }
};

const Lists = {
  name: 'tskslists',
  builder: function(privateClient, publicClient) {
    
    // check https://github.com/lesion/remotestorage-module-bookmarks/blob/master/index.js for inspiration, interesting state management
    privateClient.declareType('list', {
      "type": "object",
      "properties": {
        "id": { // createdAt
          "type": "string",
          "format": "date-time"
        },
        "title": { "type": "string" },
        "content": {
          "type": "array",
          "uniqueItems": true,
          "default": [],
          "items": {
            "type": "string"
          }
        },
        "updatedAt": {
          "type": "string",
          "format": "date-time"
        }
      },
      "required": [ "id", "title", "updatedAt" ]
    });

    //privateClient.on('change', console.log)
    
    const methods = {
      get: (id) => privateClient.getObject(id),
      getAll: () => privateClient.getAll(''),
      getListing: () => privateClient.getListing(''),
      create: function(list = {}) {
        //return privateClient.getListing('').then(listing => {
          list.id = new Date().toISOString().replaceAll(/:|\./g,'-');
          list.title = '';
          list.content = [];
          list.updatedAt = new Date().toISOString();
          return privateClient.storeObject("list", list.id, list)
            .then(() => list);
        //});
      }
      ,
      update: function(id, key, value) {
        return privateClient.getObject(id).then(list => {
          if (list[key] == value) return list; // don't update if it's the same
          list[key] = value;
          list.updatedAt = new Date().toISOString();
          return privateClient.storeObject("list", list.id, list)
            .then(() => list);
        });
      },
      updateTitle: function(id, title) {
        return this.update(id, 'title', title);
      },
      prependContent: function(id, tid) {
        return privateClient.getObject(id).then(list => {
          list.content.unshift(tid);
          list.updatedAt = new Date().toISOString();
          return privateClient.storeObject("list", list.id, list)
            .then(() => list);
        });
      },
      insertContent: function(id, tid, pos) {
        return privateClient.getObject(id).then(list => {
          list.content.splice(pos, 0, tid);
          list.updatedAt = new Date().toISOString();
          return privateClient.storeObject("list", list.id, list)
            .then(() => list);
        });
      },
      delete: function(id) {
        // TODO delete all tasks that are now orphans
        return privateClient.remove(id);
      },
      on: privateClient.on
    };
    
    return {
      exports: methods
    }
  }
};

