// A category is store as a markdown file on webdav
class Category {

  static #webdav;
  static init(webdav) {
    Category.#webdav = webdav;
  }

  static async all() {
    const children = (await Category.#webdav.dir('tasks/').children()).filter(child =>
      child.name.endsWith('.md')
      && child.name !== 'today.md'
    );
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      children[i] = await Category.create(children[i]);
    }
    return children;
  }
  static async nextOrder() {
    return Math.max(0, ...(await Category.all()).map(category => category.order))+1;
  }

  static async create(file) {
    const category = new Category(file);
    await category.load();
    return category;
  }

  #file;
  #content;
  #frontmatter = {};
  #matter = '';
  #loaded = false;
  constructor(file) {
    this.#file = file;
  }

  // ID ?? UUID ??

  // get/set

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
    return [...this.#matter.matchAll(/^# (.*)$/gm)];
  }
  // set sections(value) {}

  // group: h2
  groups() {
    return [...this.#matter.matchAll(/^## (.*)$/gm)];
  }

  // task: - [ ]
  tasks() {
    return [...this.#matter.matchAll(/^([ \t]*)\- \[([ x])\] (.*)$/gm)];
  }

  isLoaded() { return this.#loaded; }

  async load() {
    // TODO check ETAG
    this.#content = await this.#file.read();

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

    this.#loaded = true;
  }
  
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

    return this.#file.write(`---\n${this.#frontmatter}---\n\n`+this.#matter);
  }
}