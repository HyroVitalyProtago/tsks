import { createTemplate } from './creator.js'
import { createTask, deleteTask } from './db.js'
import { autoheight } from './utils.js'

const template = /*html*/`
<li class="task">
  <input type="checkbox" />
  <textarea class="task-title inline-input" rows="1"></textarea>
</li>`

function onCheckChange(e, d) {
  d.done = e.target.checked
  task.onChange(e, d)
}

function onTitleKeyUp(e, d) {
  autoheight(e.target)
}

function onTitleKeyDown(e, d) {
  if (e.keyCode === 8 && e.target.value === '') {
    // DELETE task when backspace on empty string
    e.preventDefault();
    deleteTask(d)
    const previousInput = e.target.parentNode.previousElementSibling.querySelector('.task-title');
    task.onChange(e,d)
    const len = previousInput.value.length * 2;
    previousInput.setSelectionRange(len, len);
    previousInput.focus(); // focus at the end to not fire onblur event that call updateTaskTitle and try to remove again
  } else if (e.keyCode === 13) {
    // On enter, append a new task and change focus to it
    e.preventDefault();
    if (e.target.value === '') return;
    createTask(d.section, d)
    task.onChange(e,d)
    e.target.parentNode.nextElementSibling.querySelector('.task-title').focus()
  } else { // update title
    d.title = e.target.value
    task.onChange(e,d)
  }
}

function onTitleBlur(e, d) {
  if (e.target.value === '') {
    deleteTask(d)
  } else { // update title
    d.title = e.target.value
  }
  task.onChange(e,d)
}

const task = {
  create: createTemplate(template),
  init: init => {
    init.select('.task-title')
      .on('keyup', onTitleKeyUp)
      .on('keydown', onTitleKeyDown)
      .on('blur', onTitleBlur)
    init.select('input[type="checkbox"]').on('change', onCheckChange)
  },
  update: update => {
    update.select('.task-title').text(d => d.title).each((_,i,a) => autoheight(a[i]))
    update.select('input[type="checkbox"]').property('checked', d => d.done)
  },
  join: [
    enter => enter.append(task.create).call(task.init).call(task.update),
    update => update.call(task.update),
    // exit => exit.remove()
  ],
  onChange: (evt, d) => { } // default handler
}

export { task }