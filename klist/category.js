function createTemplate(html) {
  const ret = document.createElement('template');
  ret.innerHTML = html;
  return ret;
}

function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

// Helpers
// function selectElementContents(el) {
//   var range = document.createRange();
//   range.selectNodeContents(el);
//   var sel = window.getSelection();
//   sel.removeAllRanges();
//   sel.addRange(range);
// }
// function insertAfter(newNode, referenceNode) {
//   referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
// }
// if (!Array.prototype.last){
//   Array.prototype.last = function(){
//     return this[this.length - 1];
//   };
// };

// A category is store as a markdown file on webdav
class Category {

  static #webdav;
  static init(webdav) {
    Category.#webdav = webdav;
  }

  // TODO Memoization/Cache?
  static async all(withToday = false) {
    const children = (await Category.#webdav.dir('tasks/').children()).filter(child =>
      child.name.endsWith('.md')
      && (withToday || child.name !== 'today.md')
    );
    for (let i = 0; i < children.length; i++) {
      children[i] = await Category.fromFile(children[i]);
    }
    return children.sort((a,b) => a.order - b.order);
  }
  static async nextOrder() {
    return Math.max(0, ...(await Category.all()).map(category => category.order))+1;
  }
  static async today() {
    return Category.fromFile(Category.#webdav.file('tasks/today.md'));
  }

  static async fromFile(file) {
    const category = new Category(file);
    await category.load();
    return category;
  }

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

    // clone.category = category;
    clone.querySelector('.title').value = category.title;

    const toggleFolding = (e) => {
      // hide next ul element
      const nextUlElement = e.target.parentElement.nextElementSibling;
      nextUlElement.style.display = nextUlElement.style.display === 'none' ? null : 'none';
  
      // change icon
      e.target.textContent = nextUlElement.style.display === 'none' ? '▸' : '▾';

      // TODO update frontmatter ? or 
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
      const h1 = document.createElement('h1');
      h1.textContent = '📁 Section';
      category.#markdom.body.appendChild(document.createTextNode('\n\n')); // TODO check if there is already \n at the end
      category.#markdom.body.appendChild(h1);

      const section = new Section(h1, category);
      category.#sections.push(section);

      const sectionElement = Section.createElement(section);
      clone.querySelector('ul').appendChild(sectionElement); // append li at the end of ul
      sectionElement.querySelector('.title').select();
    }

    clone.querySelector('.btn-toggle-folding').addEventListener('click', toggleFolding);
    clone.querySelector('.title').addEventListener('change', updateTitle);
    clone.querySelector('.btn-add-section').addEventListener('click', createSection);

    category.sections().forEach(section => {
      if (section.title === undefined) return;
      const sectionElement = Section.createElement(section);
      clone.querySelector('ul').appendChild(sectionElement);
    });

    return clone;
  }

  static currentCategory;
  static currentSection;

  #file;
  #content;
  #frontmatter = {};
  #matter = '';
  #markdom;
  #sections;
  // #groups;
  // #tasks;
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
  frontmatter() { return this.#frontmatter; }
  // content() { return this.#content; } // frontmatter + matter
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
      // this.#frontmatter.uuid = crypto.randomUUID(); // TODO useful?
      this.#matter = this.#content;
    }

    // content parsing into dom
    this.#markdom = markdownParse(this.#matter);
    this.#sections = [new Section(null, this)]; // default section at the beginning of the document before the first
    let currentIndentationLevel = 0;
    this.#markdom.body.childNodes.forEach(child => {
      if (child.nodeName === '#text' && child.nodeValue.trim() === '') {
        currentIndentationLevel = (child.nodeValue.match(/\t/g) || []).length;
        return;
      }
      if (child.nodeName === 'H1') return this.#sections.push(new Section(child, this));
      // if (child.nodeName === 'H2') Groups
      if (child.nodeName === 'DIV') return this.#sections[this.#sections.length-1].appendTask(new Task(child, this, currentIndentationLevel));
    });

    this.#loaded = true;
  }

  markdom() { return this.#markdom; }
  
  async save() {
    // New file
    if (Object.keys(this.#frontmatter).length <= 0) {
      this.#frontmatter.order = await Category.nextOrder();
      //this.#frontmatter.uuid = crypto.randomUUID(); // TODO useful?
    }

    // TODO replace this.#matter with this.#markdom.html()
    // console.log(`---\n${jsyaml.dump(this.#frontmatter)}---\n\n`+this.#matter);
    // console.log(`---\n${jsyaml.dump(this.#frontmatter)}---\n\n`+this.#markdom.html());

    return this.#file.write(`---\n${jsyaml.dump(this.#frontmatter)}---\n\n`+this.#markdom.html());
  }
}

const markdownParse = (text) => {
	const dom = new DOMParser().parseFromString(text
		.replace(/^### (.*$)/gim, '<h3>$1</h3>') // h3 tag
		.replace(/^## (.*$)/gim, '<h2>$1</h2>') // h2 tag
		.replace(/^# (.*$)/gim, '<h1>$1</h1>') // h1 tag
		.replace(/\*\*(.*)\*\*/gim, '<b>$1</b>') // bold text
		.replace(/\*(.*)\*/gim, '<i>$1</i>') // italic text

    // links
    .replace(/\[([^\]]*)\]\(([^\)]*)\)/gim, '<a target="_blank" href="$2">$1</a>')
    .replace(/ (http.*)(\s)/gim, ' <a target="_blank" href="$1" data-type="simple">$1</a>$2')

    // tasks
    .replace(/^([ \t]*)\- \[([ x])\] (.*)$/gim, `$1<div class="task"><input type="checkbox" checked="$2" /><span class="title">$3</span></div>`)
    .replaceAll('checked="x"', 'checked')
    .replaceAll('checked=" "', '')
	  , 'text/html');  

  dom.html = () => {
    let html = '';
    
    // https://developer.mozilla.org/en-US/docs/Web/API/Document/createTreeWalker
    const treeWalker = document.createTreeWalker(dom);
    
    let currentNode = treeWalker.currentNode;
    while(currentNode) {
      // TODO (sub)task indentation
      if (currentNode.nodeName === "H1") {
        html += `# ${currentNode.textContent}`;
        currentNode = treeWalker.nextNode(); // pass next text node
      } else if (currentNode.nodeName === "H2") {
        html += `## ${currentNode.textContent}`;
        currentNode = treeWalker.nextNode(); // pass next text node
      } else if (currentNode.nodeName === "B") {
        html += `**${currentNode.textContent}**`;
        currentNode = treeWalker.nextNode(); // pass next text node
      } else if (currentNode.nodeName === "INPUT") {
        if (currentNode.type = "checkbox") {
          const checked = currentNode.checked ? 'x' : ' ';
          html += `- [${checked}] `;
        }
      } else if (currentNode.nodeName === "A") {
        if (currentNode.getAttribute('data-type')) {
          html += `${currentNode.href}`;
        } else {
          html += `[${currentNode.textContent}](${currentNode.href})`;
        }
        currentNode = treeWalker.nextNode(); // pass next text node
      } else if (currentNode.nodeName === "#text") {
        html += currentNode.nodeValue;
      }

      currentNode = treeWalker.nextNode();
    }

    return html;
  }

  return dom;
}

class Section {
  static template = createTemplate(`
  <li>
    <span class="icon"></span>
    <input class="title" type="text" size="14" />
  </li>
  `);
  static createElement(section) {
    const clone = Section.template.cloneNode(true).content.firstElementChild;
    
    clone.section = section;
    clone.id = section.id();
    clone.querySelector('.icon').textContent = section.icon;
    clone.querySelector('.title').value = section.title;

    clone.addEventListener('click', () => section.select());
    clone.querySelector('.title').addEventListener('change', e => section.title = e.target.value);

    return clone;
  }

  icon;
  #title;
  // groups;
  tasks = [];
  category;

  #shadowNode;
  constructor(node, category) {
    this.#shadowNode = node;
    this.category = category;

    if (node === null) {
      // TODO
    } else {
      const name = node.textContent;
      const values = name.split(' ');
      this.icon = values.length > 1 ? values[0] : '📁';
      this.#title = values.length > 1 ? values[1] : values[0];
    }
  }

  get title() {
    return this.#title;
  }

  set title(value) {
    if (value === '') {
      console.log('TODO remove section');
      return;
    }
    // TODO check value
    this.#title = value;
    if (Category.currentSection === this) main.querySelector('.title').value = this.title;
    if (this.#shadowNode !== null) {
      this.#shadowNode.textContent = `${this.icon} ${this.#title}`; 
      this.category.save();
    }
  }

  appendTask(task) {
    this.tasks.push(task);
  }

  newTask(value) {
    // create task element in markdom
    const taskElement = Task.createElement({checked:false, title:value});
    if (this.#shadowNode !== null) {
      this.#shadowNode.parentNode.insertBefore(taskElement, this.#shadowNode.nextSibling);
      this.#shadowNode.parentNode.insertBefore(document.createTextNode('\n'), this.#shadowNode.nextSibling);
    } else {
      console.error('Not supported yet...');
      return;
    }
    
    // create task & append
    const task = new Task(taskElement, this.category);
    this.tasks.unshift(task); // prepend
    
    this.category.save();
    this.select(); // reload ?
  }

  id() {
    return encodeURI(`${this.category.title}--${this.title}`);
  }

  select() {
      // TODO only works if category and section title pair is unique...
      const st = nav.scrollTop;
      location.hash = encodeURI(`${this.category.title}--${this.title}`);
      nav.scrollTop = st; // don't scroll anything
      document.body.scrollTop = 0;

      Category.currentCategory = this.category;
      Category.currentSection = this;

      main.querySelector('.icon').textContent = this.icon;
      main.querySelector('.title').value = this.title;

      if (this.category.frontmatter().background) {
        document.querySelector('aside').style.backgroundImage = `url(${this.category.frontmatter().background})`;
      } else {
        document.querySelector('aside').style.backgroundImage = `url("https://images8.alphacoders.com/992/992848.jpg")`;
      }

      const content = main.querySelector('.content');
      content.innerHTML = ''; // reset

      let node = this.#shadowNode.nextSibling;
      while (node) {
        if (node.nodeName === 'H1') break;
        
        if (node.nodeName === 'H2') { // Group
          content.appendChild(node.cloneNode(true));
        } else if (node.nodeName === 'DIV') { // Task
          content.appendChild(node.task.node)
        }

        node = node.nextSibling;
      }

      // this.tasks.forEach(task => content.appendChild(task.node));
  }
}

class Task {
  static template = createTemplate(`<div class="task"><input type="checkbox" /><span class="title"></span></div>`);
  static createElement(task) {
    const clone = Task.template.cloneNode(true).content.firstElementChild;

    const titleElement = clone.querySelector('.title');
    const checkboxElement = clone.querySelector('input[type="checkbox"]');

    titleElement.textContent = task.title;
    checkboxElement.checked = task.checked;

    // clone.querySelector('.icon').textContent = section.icon;
    // clone.querySelector('.title').value = section.title;

    // clone.addEventListener('click', () => section.select());
    // clone.querySelector('.title').addEventListener('change', e => section.title = e.target.value);

    return clone;
  }

  title;
  done;
  node;
  #shadowNode;
  #category;
  constructor(node, category, indentationLevel) {
    node.task = this;
    this.#shadowNode = node;
    this.#category = category;
    this.node = node.cloneNode(true);
    this.node.task = this;
    this.node.draggable = "true";
    
    if (indentationLevel > 0) {
      this.node.style.marginLeft = `${indentationLevel*1.5}em`;
    }

    const titleElement = this.node.querySelector('.title');
    const checkboxElement = this.node.querySelector('input[type="checkbox"]');
    
    this.title = titleElement.textContent;
    this.done = checkboxElement.checked;
    this.archived = this.title.includes('🪦');
    if (this.archived) {
      this.node.style.display = 'none';
    }

    if (checkboxElement.checked) titleElement.classList.add('checked');
    checkboxElement.addEventListener('change', (e) => {
      if (e.target.checked) {
        titleElement.classList.add('checked');
        this.#shadowNode.querySelector('input[type="checkbox"]').checked = true;
      } else {
        titleElement.classList.remove('checked');
        this.#shadowNode.querySelector('input[type="checkbox"]').checked = false;
      }
      this.#category.save();
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
      // console.log(e.target.textContent);
      this.#shadowNode.innerHTML = this.node.innerHTML;
      this.#category.save();
    });

    const getTarget = (e) => {
      if (e.target.draggable && e.target.classList.contains('task')) {
        return e.target;
      } else {
        return e.target.closest('.task[draggable]');
      }
    }
    this.node.addEventListener('dragstart', e => {
      const id = crypto.randomUUID();
      e.target.id = id;
      e.dataTransfer.setData("text", id);
    });
    this.node.addEventListener('drag', e => e.target.style.display = 'none');
    this.node.addEventListener('dragend', e => e.target.style.display = null);
    this.node.addEventListener('dragover', e => e.preventDefault());
    this.node.addEventListener('dragenter', e => {
      const target = getTarget(e);
      if (!target) return;
      
      if (target.style.borderTop) { target.dragEnterCount = 1; }
      target.style.borderTop = 'thick double #32a1ce';
    });
    this.node.addEventListener('dragleave', e => {
      const target = getTarget(e);
      if (!target) return;

      if (target.dragEnterCount == 1) {
        target.dragEnterCount = 0;
        return;
      }
      target.style.borderTop = null;
    });
    this.node.addEventListener('drop', e => {
      const target = getTarget(e);
      if (!target) return;
      
      target.style.borderTop = null;
      const data = e.dataTransfer.getData("text");
      target.parentNode.insertBefore(document.getElementById(data), target);
      
      // update shadowdom (SN:ShadowNode)
      const targetSN = target.task.#shadowNode;
      const droppedSN = document.getElementById(data).task.#shadowNode;
      droppedSN.nextSibling.textContent = droppedSN.nextSibling.textContent.replace('\n', '');
      targetSN.parentNode.insertBefore(droppedSN, targetSN);
      targetSN.parentNode.insertBefore(document.createTextNode('\n'), targetSN);
      target.task.#category.save();

      e.dataTransfer.clearData();
    });
  }
}

export { Category, Task }