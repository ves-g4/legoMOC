"use strict";

const searchCategories = {
  elements: {
    title: "Elements",
    itemTooltip: ["global element", "local element"],
    indexArray: null
  }
};

var searchTargetMaps; // files: 36, targets: 36

var updateSearchResults = function() {};

function indexFilesLoaded()
{
  for (const name in searchCategories)
  {
    if (! searchCategories[name].indexArray)
      return false;
  }
  
  return searchTargetMaps;
} 

function loadScripts(doc, tag) 
{
  createElem(doc, tag, 'search.js');
  createElem(doc, tag, 'search-indexes.js');
  createElem(doc, tag, 'search-targets.js');  
}

function createElem(doc, tag, path)
{
  var script = doc.createElement(tag);
  var scriptElement = doc.getElementsByTagName(tag)[0];
  script.src = pathToRoot + 'search/' + path;
  scriptElement.parentNode.insertBefore(script, scriptElement);
}