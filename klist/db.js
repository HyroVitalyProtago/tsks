// ==============
// ==== DATA ====
// ==============
const defaultData = {
  sections: [
    { title: 'Today', tasks: ['t1', 't2'] },
    { title: 'Tomorrow', tasks: ['t3'] }
  ],
  tasks: {
    t1: { title: 'Write some d3', state: 'done' },
    t2: { title: 'Write some web stuff', state: 'pending' },
    t3: { title: 'Write some d4', state: 'pending' }
  }
}

const json = localStorage.getItem('data')
const data = json ? JSON.parse(json) : defaultData

data.sections.forEach(s => {
  s.tasks = s.tasks.map(tid => {
    const t = data.tasks[tid]
    t.id = tid
    t.section = s
    return t
  })
})

function save() {
  // replace tasks by id in section.tasks
  // remove id and section from tasks
  const copy = {
    sections: data.sections.map(s => { return {title:s.title, tasks:s.tasks.map(t => t.id)} }),
    tasks: Object.entries(data.tasks).reduce((acc, [tid, t]) => {
      acc[tid] = {title:t.title, state:t.state}
      return acc
    }, {})
  }
  // copy.sections.forEach(s => s.tasks = s.tasks.map(t => t.id))
  localStorage.setItem('data', JSON.stringify(copy))
}

// =================
// ==== SECTION ====
// =================
function createSection() {
  let section = {title:'', tasks:[]}
  data.sections.push(section)
  return section
}

function deleteSection(section) {
  // TODO delete all orphans tasks ?
  data.sections = data.sections.filter(s => s != section)
}

// ==============
// ==== TASK ====
// ==============
function createTask(section, previousTask) {
  const id = crypto.randomUUID()
  const t = {
    id:id,
    title:'',
    state:'pending',
    section: section
  }
  data.tasks[id] = t
  if (previousTask) {
    section.tasks.splice(section.tasks.indexOf(previousTask)+1, 0, t)
  } else {
    section.tasks.unshift(t)
  }
  return t
}

function deleteTask(task) {
  task.section.tasks = task.section.tasks.filter(t => t != task)
  delete data.tasks[task.id]
}

export { data, save, createSection, deleteSection, createTask, deleteTask }