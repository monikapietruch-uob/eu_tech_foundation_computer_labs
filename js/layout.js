/*
  js/layout.js — puts the same header, navigation bar and footer on every
  page. There is no build step in this project, so instead of copying the
  header into each HTML file we keep it once, here, and inject it into three
  placeholder elements: <div data-layout="header">, <div data-layout="nav">
  and <div data-layout="footer">. It also works out which page the student
  is on and marks that nav link with aria-current="page". Each page keeps
  its own <h1> and content in plain HTML, so if this script fails to load
  the page is still readable — only the shared chrome is missing.
*/
(function () {
  "use strict";

  var NAV_LINKS = [
    { href: "index.html",           label: "Home" },
    { href: "practice-python.html", label: "Python practice" },
    { href: "practice-web.html",    label: "Web practice" },
    { href: "practice-ai.html",     label: "AI task" },
    { href: "index.html#resources", label: "Resources" }
  ];

  // The file name of the page we are on, e.g. "practice-web.html".
  // A URL that ends in "/" (the site root) means index.html.
  function currentPageName() {
    var path = window.location.pathname;
    var last = path.substring(path.lastIndexOf("/") + 1);
    return last === "" ? "index.html" : last;
  }

  function buildHeader() {
    // The skip link is the first Tab stop on every page: keyboard users
    // jump straight past the banner and nav to the content.
    return '<a class="skip-link" href="#main">Skip to the content</a>' +
           '<header><div class="container"></div></header>';
  }

  function buildNav() {
    var here = currentPageName();
    var html = '<nav aria-label="Main"><div class="container">';
    NAV_LINKS.forEach(function (link) {
      var linkPage = link.href.split("#")[0];
      var isHere = linkPage === here && link.href.indexOf("#") === -1;
      html += '<a href="' + link.href + '"' +
              (isHere ? ' aria-current="page"' : "") + ">" +
              link.label + "</a>";
    });
    html += "</div></nav>";
    return html;
  }

  function buildFooter() {
    var year = new Date().getFullYear();
    return '<footer><div class="container">' +
           "<p>&copy; Monika Pietruch &mdash; " + year + "</p>" +
           "</div></footer>";
  }

  function inject(name, html) {
    var slot = document.querySelector('[data-layout="' + name + '"]');
    if (slot) {
      slot.outerHTML = html;
    }
  }

  inject("header", buildHeader());
  inject("nav", buildNav());
  inject("footer", buildFooter());

  var main = document.querySelector("main");
  if (main && !main.id) { main.id = "main"; main.setAttribute("tabindex", "-1"); }
})();
