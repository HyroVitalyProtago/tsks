function autoheight(x) {
  x.style.height = "5px";
  x.style.height = x.scrollHeight + "px";
}

function insertAfter(newNode, referenceNode) {
  referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
}

export { autoheight, insertAfter }