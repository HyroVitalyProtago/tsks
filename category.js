function createTemplate(html) {
  const ret = document.createElement('template');
  ret.innerHTML = html;
  return ret;
}

// A category is store as a markdown file on webdav
class Category {

  static #webdav;
  static init(webdav) {
    Category.#webdav = webdav;
  }

  // TODO Memoization/Cache?
  static async all() {
    const children = (await Category.#webdav.dir('tasks/').children()).filter(child =>
      child.name.endsWith('.md')
      && child.name !== 'today.md'
    );
    for (let i = 0; i < children.length; i++) {
      children[i] = await Category.fromFile(children[i]);
    }
    return children;
  }
  static async nextOrder() {
    return Math.max(0, ...(await Category.all()).map(category => category.order))+1;
  }
  static async today() {
    return Category.fromFile(Category.#webdav.file('tasks/today.md'));
  }

  // static async get(id) {
  //   const category = new Category(Category.#webdav.file(id));
  //   await category.load();
  //   return category;
  // }

  static async fromFile(file) {
    const category = new Category(file);
    await category.load();
    return category;
  }

  // static async get(name) {
  //   return Category.fromFile(Category.#webdav.file(`tasks/${name}.md`));
  // }

  static async create() {
    const file = Category.#webdav.file('tasks/Catégorie.md');
    if (await file.exist()) {
      console.log("can't create existing file...");
      return;
    }
    
    const category = new Category(file);
    await category.save();
    return category;
  }

  static template = createTemplate(`
  <section>
    <h1>
      <span class="icon btn-toggle-folding">▾</span>
      <input class="title" type="text" size="10"/>
      <button class="btn-add-section"></button>
    </h1>
    <ul>
      <!-- sections -->
    </ul>
  </section>
  `);
  static createElement(category) {
    const clone = Category.template.cloneNode(true).content.firstElementChild;

    clone.category = category;
    //clone.setAttribute('title', category.title);
    clone.querySelector('.title').value = category.title;
    if (category.order) {
      clone.style.order = category.order;
    }

    const toggleFolding = (e) => {
      // hide next ul element
      const nextUlElement = e.target.parentElement.nextElementSibling;
      nextUlElement.style.display = nextUlElement.style.display === 'none' ? null : 'none';
  
      // change icon
      e.textContent = nextUlElement.style.display === 'none' ? '▸' : '▾';
    }
  
    const updateTitle = async (e) => {
      const target = e.target;
      try {
        await category.rename(target.value);
      } catch(e) {
        console.error(e);
        target.value = categoryName;
      }
    }
  
    const createSection = async (e) => {
      const section = new Section('Section', category);
      this.#sections.push(section);
      const sectionElement = Section.createElement(section, category);
      clone.querySelector('ul').appendChild(sectionElement); // append li at the end of ul
      sectionElement.querySelector('.title').select();
    }

    clone.querySelector('.btn-toggle-folding').addEventListener('click', toggleFolding);
    clone.querySelector('.title').addEventListener('change', updateTitle);
    clone.querySelector('.btn-add-section').addEventListener('click', createSection);

    category.sections().forEach(section => {
      if (section.title === undefined) return;
      const sectionElement = Section.createElement(section, category);
      clone.querySelector('ul').appendChild(sectionElement);
    });

    return clone;
  }

  #file;
  #content;
  #frontmatter = {};
  #matter = '';
  #markdom;
  #sections;
  #groups;
  #tasks;
  #loaded = false;
  constructor(file) {
    this.#file = file;
  }

  // ID ?? UUID ??

  // get/set

  async rename(value) {
    if (!value || value === '') {
      throw "value can't be null or empty";
    }

    // TODO check if value if a valid name

    const path = `tasks/${value}.md`;
    
    if (await Category.#webdav.file(path).exist()) {
      throw "can't overwrite an existing file";
    }

    return this.#file.move(encodeURI(`https://db.ldavid.fr/webdav/tasks/${value}.md`));
  }

  get title() { return capitalizeFirstLetter(decodeURI(this.#file.name).replace(/\..*$/, '')); }
  // set title(value) {}
  content() { return this.#content; } // frontmatter + matter
  matter() { return this.#matter; }

  // TODO
  // - order always begin at 0
  // - order is continous [0,1,2,...], no jump in between ~[0,2,...]~
  // - order can't have the same value for multiple categories
  // else write all files with corrected order
  get order() { return this.#frontmatter.order; }
  // set order(value) {}
  
  // section: h1
  sections() {
    return this.#sections;//[...this.#matter.matchAll(/^# (.*)$/gm)];
  }

  // group: h2
  // groups() {
  //   return [...this.#matter.matchAll(/^## (.*)$/gm)];
  // }

  // task: - [ ]
  // tasks() {
  //   return [...this.#matter.matchAll(/^([ \t]*)\- \[([ x])\] (.*)$/gm)];
  // }

  isLoaded() { return this.#loaded; }

  async load() {
    // TODO check ETAG
    this.#content = await this.#file.read();

    // frontmatter
    const split = this.#content.split('---');
    if (this.#content.startsWith('---') && split.length > 2) {
      // yaml frontmatter parsing
      this.#frontmatter = jsyaml.load(split[1].trim());
      this.#matter = split[2].trim();
    } else {
      // setup frontmatter
      this.#frontmatter.order = await Category.nextOrder();
      this.#frontmatter.uuid = crypto.randomUUID(); // TODO useful?
      this.#matter = this.#content;
    }

    // content parsing into dom
    this.#markdom = markdownParse(this.#matter);
    // console.log(this.#markdom);
    this.#sections = [new Section(null, this)]; // default section at the beginning of the document before the first
    this.#markdom.body.childNodes.forEach(child => {
      if (child.nodeName === '#text' && child.nodeValue.trim() === '') return;
      if (child.nodeName === 'H1') return this.#sections.push(new Section(child.textContent, this));
      if (child.nodeName === 'SPAN') {
        return this.#sections[this.#sections.length-1].appendTask(new Task(
          child.querySelector('.title').innerHTML,
          child.querySelector('input[type="checkbox"]').checked,
          child
        ));
      }
    });
    // console.log(this.#sections);

    // console.log(this.#matter);
    // console.log(this.#markdom.html());

    this.#loaded = true;
  }

  markdom() { return this.#markdom; }
  
  async save() {
    // TODO recompute matter
    /*
    const groups = [...content.matchAll(/^## (.*)$/gm)];
    const tasks = [...content.matchAll(/^([ \t]*)\- \[([ x])\] (.*)$/gm)];
    tasks.forEach(m => {
      const group = groups.filter(t => t.index < m.index).last();
      m.title = group[1];
      if (!group.tasks) group.tasks = [];
      group.tasks.push(m);
    });
    //console.log(tasks)
    //console.log(groups);

    // TODO? keep groups even if there is no tasks in it
    // example
    // from tasks to md
    const begin = content.split('##')[0]; // keep the beginning of the file
    let currentGroup;
    const md = tasks.reduce((acc, task) => {
      let ret = '';
      if (currentGroup !== task.title) {
        if (currentGroup) ret += '\n'; // not on the first one
        currentGroup = task.title;
        ret += `## ${currentGroup}\n`;
      }
      ret += `${task[1]}- [${task[2]}] ${task[3]}\n`;
      return acc + ret;
    }, begin);
    */

    // New file
    if (Object.keys(this.#frontmatter).length <= 0) {
      this.#frontmatter.order = await Category.nextOrder();
      this.#frontmatter.uuid = crypto.randomUUID(); // TODO useful?
    }

    return this.#file.write(`---\n${jsyaml.dump(this.#frontmatter)}---\n\n`+this.#matter);
  }
}

const markdownParse = (text) => {
	const dom = new DOMParser().parseFromString(text
		.replace(/^### (.*$)/gim, '<h3>$1</h3>') // h3 tag
		.replace(/^## (.*$)/gim, '<h2>$1</h2>') // h2 tag
		.replace(/^# (.*$)/gim, '<h1>$1</h1>') // h1 tag
		.replace(/\*\*(.*)\*\*/gim, '<b>$1</b>') // bold text
		.replace(/\*(.*)\*/gim, '<i>$1</i>') // italic text

    .replace(/^([ \t]*)\- \[([ x])\] (.*)$/gim, `$1<span class="task"><input type="checkbox" checked="$2" /><span class="title">$3</span></span>`) // tasks
    .replaceAll('checked="x"', 'checked')
    .replaceAll('checked=" "', '')

    .replace(/\[([^\]]*)\]\(([^\)]*)\)/gim, '<a target="_blank" href="$2">$1</a>') // links
    .replace(/ (http.*)\s/gim, ' <a target="_blank" href="$1">$1</a>') // links
	  /*.trim()*/, 'text/html'); // using trim method to remove whitespace
  // console.log(dom.body.innerHTML);

  // const treeWalker = document.createTreeWalker(dom.body);
  // let currentNode = treeWalker.currentNode;
  // while(currentNode) {
  //   // console.log(currentNode);
  //   // console.log(currentNode.nodeName);

  //   // TODO (sub)task indentation
    
  //   if (currentNode.nodeName === "#text") {
  //     const level = (currentNode.data.match(/\t/g) || []).length;
  //     const ul = document.createElement('ul');
  //     // ul.level = level;
  //     const li = document.createElement('li');
  //     li.appendChild(currentNode.nextSibling);
  //     ul.appendChild(li);
  //   }

  //   currentNode = treeWalker.nextNode();
  // }

  console.log(dom.body);

  dom.html = () => {
    let html = '';
    
    // https://developer.mozilla.org/en-US/docs/Web/API/Document/createTreeWalker
    const treeWalker = document.createTreeWalker(dom);
    
    let currentNode = treeWalker.currentNode;
    while(currentNode) {
      // console.log(currentNode);
      // console.log(currentNode.nodeName);

      // TODO (sub)task indentation
      if (currentNode.nodeName === "B") {
        html += `**${currentNode.textContent}**`;
        currentNode = treeWalker.nextNode(); // pass next text node
      } else if (currentNode.nodeName === "INPUT") {
        if (currentNode.type = "checkbox") {
          const checked = currentNode.checked ? 'x' : ' ';
          html += `- [${checked}] `;
        }
      } else if (currentNode.nodeName === "A") {
        html += `[${currentNode.href}](${currentNode.textContent})`;
        currentNode = treeWalker.nextNode(); // pass next text node
      } else if (currentNode.nodeName === "#text") {
        html += currentNode.nodeValue;
      }

      currentNode = treeWalker.nextNode();
    }

    return html;
  }
  // dom.html();
  // console.log(dom.html());

  return dom;
}

class Section {
  static template = createTemplate(`
  <li>
    <span class="icon"></span>
    <input class="title" type="text" size="14" />
  </li>
  `);
  static createElement(section, category) {
    const clone = Section.template.cloneNode(true).content.firstElementChild;

    clone.section = section;
    clone.querySelector('.icon').textContent = section.icon;
    clone.querySelector('.title').value = section.title;

    // const select = () => {
      
    // }
  
    const updateTitle = async (e) => {
      // const target = e.target;
      // try {
      //   await category.rename(target.value);
      // } catch(e) {
      //   console.error(e);
      //   target.value = categoryName;
      // }
    }

    clone.addEventListener('click', () => section.select());
    clone.querySelector('.title').addEventListener('change', updateTitle);

    return clone;
  }

  icon;
  title;
  // groups;
  tasks = [];
  category;
  constructor(name, category) {
    if (name === null) {
      // TODO
    } else {
      const values = name.split(' ');
      this.icon = values.length > 1 ? values[0] : '📁';
      this.title = values.length > 1 ? values[1] : values[0];
    }
    this.category = category;
  }

  appendTask(task) {
    this.tasks.push(task);
  }

  select() {
      // if (location.href.includes('#'+e.id)) return; // already selected
      // location.href = '#'+e.id;

      main.querySelector('.icon').textContent = this.icon;
      main.querySelector('.title').value = this.title;

      const content = main.querySelector('.content');
      content.innerHTML = ''; // reset
      const ul = document.createElement('ul');
      content.appendChild(ul);
      this.tasks.forEach(task => {
        const li = document.createElement('li');
        li.appendChild(task.node);
        ul.appendChild(li);
      });
      // console.log(category.markdom().body);
  }
}

class Task {
  title;
  done;
  node;
  #shadowNode;
  constructor(title, done, node) {
    this.title = title;
    this.done = done;
    this.#shadowNode = node;
    this.node = node.cloneNode(true);
    
    const titleElement = this.node.querySelector('.title');
    const checkboxElement = this.node.querySelector('input[type="checkbox"]');
    
    if (checkboxElement.checked) titleElement.classList.add('checked');
    checkboxElement.addEventListener('change', (e) => {
      if (e.target.checked) {
        titleElement.classList.add('checked');
      } else {
        titleElement.classList.remove('checked');
      }
    });

    titleElement.classList.add('strike');
    titleElement.addEventListener('mousedown', (e) => { // before click event
      if (e.target.nodeName === 'A' && e.ctrlKey) {
        window.open(e.target.href);
        // e.stopPropagation();
        return;
      }
      if (titleElement.hasAttribute('contenteditable')) return;
      titleElement.setAttribute('contenteditable', '');
      // show raw content
    });
    titleElement.addEventListener('blur', (e) => {
      if (!titleElement.hasAttribute('contenteditable')) return;
      titleElement.removeAttribute('contenteditable');
      // parse content to display
    });

    // TODO update shadowNode
  }
}