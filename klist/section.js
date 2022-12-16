import { createTemplate } from './creator.js'
import { task } from './task.js'
import { createTask, deleteSection } from './db.js'

const template = /*html*/`
<section>
  <h1>
    <span class="section-icon"></span>
    <input  type="text"
            class="section-title inline-input"
            placeholder="Ma liste de tâches"
    />
  </h1>
  <ul class="tasks">
    <li>
      <input type="checkbox" />
      <input  type="text"
              class="task-title inline-input"
              placeholder="Créer une tâche..."
              title="Commencez à écrire pour créer une tâche"
      />
    </li>
  </ul>
</section>`

function onSectionTitleKeyDown(e, d) {
  if (e.keyCode === 8 && e.target.value === '') { // DELETE section when backspace on empty string
    // TODO UX Alert if section contains (no orphan) tasks
    // TODO alert : remove list only OR remove all contained tasks OR cancel ?
    deleteSection(d)
    e.preventDefault();
    section.onChange(e,d)
  }
}

function onSectionTitleChange(e, d) {
  d.title = e.target.value
  section.onChange(e,d)
}

function onTaskTitleChange(e, d) {
  const task = createTask(d)
  task.title = e.target.value
  e.target.value = ''
  section.onChange(e,d)
}

const section = {
  create: createTemplate(template),
  init: init => {
    init.select('.section-title')
      .on('keydown', onSectionTitleKeyDown)
      .on('change', onSectionTitleChange)
    init.select('.task-title')
      .on('change', onTaskTitleChange)
  },
  update: update => {
    update.select('.section-icon')
      .text(d => d.icon)
    update.select('.section-title')
      .property('value', d => d.title)
    update.select('.tasks')
      .selectAll('.task')
      .data(d => d.tasks)
      .join(...task.join)
  },
  join: [
    enter => enter
      .append(section.create)
      .call(section.init)
      .call(section.update),
    update => update
      .call(section.update),
    exit => exit.remove()
  ],
  onChange: (evt, d) => {}
}

export { section }