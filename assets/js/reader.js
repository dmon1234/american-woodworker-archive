(function () {
  "use strict";

  var archive = window.AW_ARCHIVE || { issues: [] };
  var params = new URLSearchParams(window.location.search);
  var issueId = params.get("issue") || (archive.issues[0] && archive.issues[0].id);
  var issue = archive.issues.find(function (item) { return item.id === issueId; });

  var titleNode = document.getElementById("reader-title");
  var previousButton = document.getElementById("previous-page");
  var nextButton = document.getElementById("next-page");
  var pageInput = document.getElementById("page-number");
  var pageTotal = document.getElementById("page-total");
  var pageImage = document.getElementById("page-image");
  var pageCaption = document.getElementById("page-caption");
  var tocList = document.getElementById("toc-list");
  var thumbnailList = document.getElementById("thumbnail-list");
  var pageFrame = document.querySelector(".page-frame");
  var fitWidth = document.getElementById("fit-width");
  var actualSize = document.getElementById("actual-size");
  var printArticleButton = document.getElementById("print-article");
  var articlePrintArea = document.getElementById("article-print-area");

  var currentPage = 1;
  var currentArticle = null;

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, function (char) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[char];
    });
  }

  function clampPage(value) {
    var page = parseInt(value, 10);
    if (!Number.isFinite(page)) {
      page = 1;
    }
    return Math.max(1, Math.min(issue.pageCount, page));
  }

  function pageUrl(page) {
    return "reader.html?issue=" + encodeURIComponent(issue.id) + "&page=" + encodeURIComponent(page);
  }

  function setActiveLinks() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-page-link]"), function (link) {
      link.classList.toggle("active", Number(link.getAttribute("data-page-link")) === currentPage);
    });
  }

  function articleRanges() {
    var toc = issue.toc
      .map(function (entry, index) {
        return {
          index: index,
          title: entry.title,
          start: Number(entry.page)
        };
      })
      .filter(function (entry) {
        return Number.isFinite(entry.start) && entry.start >= 1 && entry.start <= issue.pageCount;
      })
      .sort(function (a, b) {
        if (a.start !== b.start) {
          return a.start - b.start;
        }
        return a.index - b.index;
      });

    return toc.map(function (entry, index) {
      var next = toc.slice(index + 1).find(function (candidate) {
        return candidate.start > entry.start;
      });
      return {
        title: entry.title,
        start: entry.start,
        end: next ? next.start - 1 : issue.pageCount
      };
    }).filter(function (entry) {
      return entry.end >= entry.start;
    });
  }

  function findCurrentArticle() {
    return articleRanges().filter(function (entry) {
      return currentPage >= entry.start && currentPage <= entry.end;
    }).pop() || null;
  }

  function updatePrintArticleState() {
    currentArticle = findCurrentArticle();
    printArticleButton.disabled = !currentArticle;
    printArticleButton.title = currentArticle
      ? "Print " + currentArticle.title + " (pages " + currentArticle.start + "-" + currentArticle.end + ")"
      : "No table of contents article covers this page";
  }

  function showPage(page, replaceState) {
    var pageData;
    currentPage = clampPage(page);
    pageData = issue.pages[currentPage - 1];

    pageImage.src = pageData.image;
    pageImage.alt = issue.title + ", page " + currentPage;
    pageCaption.textContent = "Page " + currentPage + " of " + issue.pageCount;
    pageInput.value = currentPage;
    previousButton.disabled = currentPage <= 1;
    nextButton.disabled = currentPage >= issue.pageCount;
    setActiveLinks();
    updatePrintArticleState();

    if (replaceState) {
      window.history.replaceState({ page: currentPage }, "", pageUrl(currentPage));
    } else {
      window.history.pushState({ page: currentPage }, "", pageUrl(currentPage));
    }
  }

  function renderToc() {
    tocList.innerHTML = issue.toc.map(function (entry) {
      return [
        '<a href="' + escapeHtml(pageUrl(entry.page)) + '" data-page-link="' + escapeHtml(entry.page) + '">',
        '<span>' + escapeHtml(entry.title) + '</span>',
        '<span class="toc-page">' + entry.page + '</span>',
        '</a>'
      ].join("");
    }).join("");

    thumbnailList.innerHTML = issue.pages.map(function (page) {
      return [
        '<a href="' + escapeHtml(pageUrl(page.number)) + '" data-page-link="' + escapeHtml(page.number) + '">',
        '<img src="' + escapeHtml(page.thumbnail) + '" alt="">',
        '<span>' + page.number + '</span>',
        '</a>'
      ].join("");
    }).join("");
  }

  function navigate(delta) {
    showPage(currentPage + delta, false);
  }

  function loadImage(image) {
    if (image.complete && image.naturalWidth > 0) {
      return Promise.resolve();
    }

    return new Promise(function (resolve) {
      image.addEventListener("load", resolve, { once: true });
      image.addEventListener("error", resolve, { once: true });
    });
  }

  function clearArticlePrint() {
    document.body.classList.remove("article-printing");
    articlePrintArea.replaceChildren();
    updatePrintArticleState();
  }

  function printCurrentArticle() {
    var pages;
    var images;

    if (!currentArticle) {
      return;
    }

    printArticleButton.disabled = true;
    articlePrintArea.replaceChildren();

    pages = issue.pages.filter(function (page) {
      return page.number >= currentArticle.start && page.number <= currentArticle.end;
    });

    images = pages.map(function (page) {
      var image = document.createElement("img");
      image.src = page.image;
      image.alt = issue.title + ", page " + page.number;
      articlePrintArea.appendChild(image);
      return image;
    });

    Promise.all(images.map(loadImage)).then(function () {
      document.body.classList.add("article-printing");
      window.print();
    });
  }

  if (!issue) {
    titleNode.textContent = "Issue not found";
    document.querySelector(".reader-shell").innerHTML = '<p class="search-panel">The requested issue is not available in this archive.</p>';
    return;
  }

  titleNode.textContent = issue.title;
  pageInput.max = issue.pageCount;
  pageTotal.textContent = "/ " + issue.pageCount;
  renderToc();
  showPage(params.get("page") || 1, true);

  previousButton.addEventListener("click", function () { navigate(-1); });
  nextButton.addEventListener("click", function () { navigate(1); });

  pageInput.addEventListener("change", function () {
    showPage(pageInput.value, false);
  });

  document.addEventListener("click", function (event) {
    var link = event.target.closest("[data-page-link]");
    if (!link) {
      return;
    }
    event.preventDefault();
    showPage(link.getAttribute("data-page-link"), false);
  });

  document.addEventListener("keydown", function (event) {
    if (event.target && /input|textarea|select/i.test(event.target.tagName)) {
      return;
    }
    if (event.key === "ArrowLeft") {
      navigate(-1);
    }
    if (event.key === "ArrowRight") {
      navigate(1);
    }
  });

  window.addEventListener("popstate", function () {
    var nextParams = new URLSearchParams(window.location.search);
    showPage(nextParams.get("page") || 1, true);
  });

  fitWidth.addEventListener("click", function () {
    pageFrame.classList.remove("actual");
    fitWidth.setAttribute("aria-pressed", "true");
    actualSize.setAttribute("aria-pressed", "false");
  });

  actualSize.addEventListener("click", function () {
    pageFrame.classList.add("actual");
    fitWidth.setAttribute("aria-pressed", "false");
    actualSize.setAttribute("aria-pressed", "true");
  });

  printArticleButton.addEventListener("click", printCurrentArticle);
  window.addEventListener("afterprint", clearArticlePrint);
}());
