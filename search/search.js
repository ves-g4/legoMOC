"use strict";
const messages =
{
  noResult: "No results found",
  loading:  "Loading search index..."
};

const NO_MATCH = {};
const MAX_RESULTS = 500;

function inNamespace (nsURI)
{
  return nsURI ? "in {" + (nsURI != "" ? nsURI : "no namespace") + "}" : null;
}

function escapeHtml(str)
{
  return str.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function getHighlightedText(str, boundaries, from, to, cls)
{
  var start = from;
  var text = "";
  for (var i = 0; i < boundaries.length; i += 2)
  {
    var b0 = boundaries[i];
    var b1 = boundaries[i + 1];

    if (b0 < to && b1 > from)
    {
      text += escapeHtml(str.slice(start, Math.max(start, b0)));
      text += "<span class='" + cls + "'>";
      text += escapeHtml(str.slice(Math.max(start, b0), Math.min(to, b1)));
      text += "</span>";
      start = Math.min(to, b1);
    }
  }

  text += escapeHtml(str.slice(start, to));
  return text;
}

function createQuery (querySpec)
{
  var queryWords = [];

  var wordSpecs = querySpec.split(/\s+/);
  
  for (const i in wordSpecs)
  {
    var tokens = wordSpecs[i].split(/(?=[A-Z.-])/);
    
    for (const j in tokens)
      tokens[j] = tokens[j].toLowerCase();
      
    queryWords.push (tokens);
  }

  return queryWords;
}

function findMatch (queryWords, input)
{
  function isUpperCase(s) { return s !== s.toLowerCase(); }
  function isLowerCase(s) { return s !== s.toUpperCase(); }

  var boundaries = [];

  var inputLower = input.toLowerCase();
  var from = 0;

  for (const i in queryWords)
  {
    var tokens = queryWords [i];

    var prevEnd = -1;

    for (const j in tokens)
    {
      var token = tokens [j];

      var start;

      for (;; from = start + 1)
      {
        if ((start = inputLower.indexOf (token, from)) < 0)
          return null;

        if (prevEnd == start)
          break;

        var curChar = input[start];

        if (/[\W_]/.test(curChar))
          break;

        var prevChar = input[start - 1] || " ";

        if (/[\W_]/.test(prevChar))
          break;

        if (isUpperCase (curChar))
        {
          if (isLowerCase (prevChar))
            break;

          var nextChar = input[start + 1] || " ";

          if (isLowerCase (nextChar) || /[\W_]/.test(nextChar) && ! isUpperCase (prevChar))
            break;
        }
      }

      var end = start + token.length;

      boundaries.push(start, end);
      
      from = end;
      prevEnd = end;
    }
  }

  return boundaries;
}

function doSearch(request, response)
{
  var term = request.term.trim();
  var maxResults = request.maxResults || MAX_RESULTS;

  if (term.length === 0)
    return this.close();

  var catSpec, nameSpec, extSpec;
  var m;

  // try to recoginze the search query as: 'category / name (extension)'
  if (m = /(.*?)\/(.*?)\(([^)]*)\)?/.exec (term))
  {
    catSpec  = m[1].trim();
    nameSpec = m[2].trim();
    extSpec  = m[3].trim();
  }
  else
  // try to recoginze the search query as: 'name (extension)'
  if (m = /(.*?)\(([^)]*)\)?/.exec (term))
  {
    nameSpec = m[1].trim();
    extSpec  = m[2].trim();
  }
  else
  // try to recoginze the search query as: 'category / name'
  if (m = /(.*?)\/(.*)/.exec (term))
  {
    catSpec  = m[1].trim();
    nameSpec = m[2].trim();
  }
  else
  {
    nameSpec = term;
  }

  var catQuery, nameQuery, extQuery;

  if (catSpec && catSpec.length !== 0)
    catQuery = createQuery (catSpec);

  if (nameSpec && nameSpec.length !== 0)
    nameQuery = createQuery (nameSpec);
  
  if (extSpec && extSpec.length !== 0)
    extQuery = createQuery (extSpec);

  if (! catQuery && ! nameQuery && ! extQuery)
    return this.close();

  var indexLoaded = indexFilesLoaded();

  var result = [];

  for (const category in searchCategories)
  {
    var categoryInfo = searchCategories [category];

    var catBoundaries;

    if (catQuery)
    {
      if (! (catBoundaries = findMatch (catQuery, categoryInfo.title)))
        continue;
    }

    var indexArray = categoryInfo.indexArray;

    var matches = [];

    if (! indexArray)
    {
      if (! indexLoaded)
      {
        matches.push ({
          msg:            messages.loading,
          category:       category,
          catBoundaries : catBoundaries
        });
      }
    }
    else
    {
      for (const i in indexArray)
      {
        var item = indexArray [i];

        var nameBoundaries, extBoundaries;

        if (nameQuery)
        {
          if (! (nameBoundaries = findMatch (nameQuery, item.n)))
            continue;
        }

        if (extQuery)
        {
          var ext = item.e ?? inNamespace (item.u);

          if (! ext || ! (extBoundaries = findMatch (extQuery, ext)))
            continue;
        }

        matches.push ({
          indexItem:      item,
          category:       category,
          catBoundaries:  catBoundaries,
          nameBoundaries: nameBoundaries,
          extBoundaries:  extBoundaries,

          score: nameBoundaries && nameBoundaries[0] === 0 ? 1 : 0
        });
      }
    }

    matches = matches.sort(function(e1, e2) { return e2.score - e1.score; }).slice(0, maxResults);
    result = result.concat (matches);
  }

  updateSearchResults = indexLoaded ? function() {} : function() { doSearch (request, response); };

  response(result);
}

// JQuery search menu implementation
$.widget("custom.catcomplete", $.ui.autocomplete, {

  _create: function() {

    this._super();
    this.widget().menu("option", "items", "> .result-item");

    // workaround for search result scrolling
    this.menu._scrollIntoView = function _scrollIntoView (item)
    {
      var borderTop, paddingTop, offset, scroll, elementHeight, itemHeight;

      if (this._hasScroll())
      {
        borderTop  = parseFloat ($.css (this.activeMenu[0], "borderTopWidth")) || 0;
        paddingTop = parseFloat ($.css (this.activeMenu[0], "paddingTop")) || 0;

        offset = item.offset().top - this.activeMenu.offset().top - borderTop - paddingTop;
        scroll = this.activeMenu.scrollTop();
        elementHeight = this.activeMenu.height() - 26;
        itemHeight = item.outerHeight();

        if (offset < 0)
          this.activeMenu.scrollTop (scroll + offset);
        else
        if (offset + itemHeight > elementHeight)
          this.activeMenu.scrollTop (scroll + offset - elementHeight + itemHeight);
      }
    };
  },

  _renderMenu: function(ul, items) {

    var inputTop = this.element.offset().top - $(window).scrollTop();
    var inputHeight = this.element.height()
    var availHeight = $(window).height();

    //var height = Math.min (availHeight * 0.75, Math.max (inputTop, availHeight - inputTop - inputHeight - 10));
    var height = Math.max (inputTop, availHeight - inputTop - inputHeight - 10);

    this.widget().css ("max-height", height + "px");

    var currentCategory = "";
    var widget = this;

    widget.menu.bindings = $();

    $.each(items, function(index, item)
    {
      if (item.category && item.category !== currentCategory)
      {
        var catTitle = searchCategories[item.category].title;

        catTitle = item.catBoundaries ? getHighlightedText(catTitle, item.catBoundaries, 0, catTitle.length, "cat-highlight") : escapeHtml (catTitle);
        ul.append ("<li class='ui-autocomplete-category'>" + catTitle + "</li>");

        currentCategory = item.category;
      }

      var li = widget._renderItemData(ul, item);
      li.attr("class", "result-item");
    });
  },

  _renderItem: function(ul, item) {

    var li  = $("<li/>").appendTo(ul);
    var div = $("<div/>").appendTo(li);

    var label;

    if (item.msg)
    {
      label = item.msg;
    }
    else
    {
      var indexItem = item.indexItem;
      var name = indexItem.n;
      
      label = item.nameBoundaries ? getHighlightedText(name, item.nameBoundaries, 0, name.length, "name-highlight") : escapeHtml (name);

      var ext = indexItem.e ?? inNamespace (indexItem.u);
      if (ext)
      {
        ext = item.extBoundaries ? getHighlightedText(ext, item.extBoundaries, 0, ext.length, "ext-highlight") : escapeHtml(ext);
        label += " <span class='result-ext'>(" + ext + ")</span>";
      }
    }

    div.html (label);

    return li;
  }
});

$(function() {

  $(".search-input, #search-input").each(function(index) {
    $(this).catcomplete ({
      minLength: 1,
      delay: 200,
      source: doSearch,
      response: function(event, ui)
      {
        if (! ui.content.length)
          ui.content.push ({ msg: messages.noResult });
        else
          $(".search-input").empty();
      },
      autoFocus: true,
      focus: function(event, ui)
      {
        if (ui.item.category)
        {
          var tooltip = searchCategories[ui.item.category].itemTooltip;
          $(".ui-autocomplete > li").attr("title", Array.isArray(tooltip) ? tooltip [ui.item.indexItem.e ? 1 : 0] : tooltip);
        }
      },
      position: { collision: "flip" },
      select: function(event, ui)
      {
        if (ui.item.indexItem)
        {
          var url;
          var t = ui.item.indexItem.t;

          if (Array.isArray(t))
          {
            var targetMap = searchTargetMaps[t[0]];
            url = targetMap[0] + '#' + targetMap[1][t[1]];
          }
          else
          {
            var targetMap = searchTargetMaps[t];
            url = Array.isArray(targetMap) ? targetMap[0] : targetMap;
          } 

          window.location.href = pathToRoot + url;
        }
      }
    }).prop("disabled", false).val('');

    if (this.id == "search-input")
      this.focus();
  });

  $(".search-reset, #search-reset").
    prop("disabled", false).
    click (function() { $(this).prev(".search-input, #search-input").val('').focus(); });
});