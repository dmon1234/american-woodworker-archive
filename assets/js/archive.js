(function () {
  "use strict";

  var archive = window.AW_ARCHIVE || { issues: [] };
  var searchForm = document.getElementById("archive-search-form");
  var searchInput = document.getElementById("archive-search-input");
  var resultsNode = document.getElementById("search-results");
  var summaryNode = document.getElementById("search-summary");
  var yearsNode = document.getElementById("issue-years");

  function escapeHtml(value) {
    return window.AWSearch.escapeHtml(value);
  }

  function readerUrl(issueId, page) {
    return "reader.html?issue=" + encodeURIComponent(issueId) + "&page=" + encodeURIComponent(page || 1);
  }

  function groupIssuesByYear() {
    return archive.issues.reduce(function (groups, issue) {
      if (!groups[issue.year]) {
        groups[issue.year] = [];
      }
      groups[issue.year].push(issue);
      return groups;
    }, Object.create(null));
  }

  function renderIssues() {
    var groups = groupIssuesByYear();
    var years = Object.keys(groups).sort();

    yearsNode.innerHTML = years.map(function (year) {
      var cards = groups[year].map(function (issue) {
        return [
          '<article class="issue-card">',
          '<a href="' + escapeHtml(readerUrl(issue.id, 1)) + '">',
          '<img src="' + escapeHtml(issue.coverImage) + '" alt="">',
          '</a>',
          '<div class="issue-card-body">',
          '<h3 class="issue-title">' + escapeHtml(issue.title) + '</h3>',
          '<p class="issue-meta">' + issue.pageCount + ' pages</p>',
          '<a class="button" href="' + escapeHtml(readerUrl(issue.id, 1)) + '">Read Issue</a>',
          '</div>',
          '</article>'
        ].join("");
      }).join("");

      return [
        '<section class="year-group">',
        '<h3 class="year-heading">' + escapeHtml(year) + '</h3>',
        '<div class="issue-grid">',
        cards,
        '</div>',
        '</section>'
      ].join("");
    }).join("");
  }

  function renderResults(results, query) {
    if (!query.trim()) {
      resultsNode.innerHTML = "";
      summaryNode.textContent = "Search article titles and page text.";
      return;
    }

    summaryNode.textContent = results.length + " result" + (results.length === 1 ? "" : "s") + " for \"" + query + "\".";

    if (!results.length) {
      resultsNode.innerHTML = '<p class="issue-meta">No matches found.</p>';
      return;
    }

    resultsNode.innerHTML = results.map(function (result) {
      var href = readerUrl(result.issue.id, result.page);
      return [
        '<article class="result-item">',
        '<div class="result-title">',
        '<a href="' + escapeHtml(href) + '">' + escapeHtml(result.title) + '</a>',
        '<span class="result-meta">Page ' + result.page + '</span>',
        '</div>',
        '<div class="result-meta">' + escapeHtml(result.issue.title) + '</div>',
        result.snippet ? '<p class="result-snippet">' + result.snippet + '</p>' : "",
        '</article>'
      ].join("");
    }).join("");
  }

  function runSearch() {
    var query = searchInput.value;
    renderResults(window.AWSearch.search(query, 40), query);
  }

  renderIssues();

  searchForm.addEventListener("submit", function (event) {
    event.preventDefault();
    runSearch();
  });

  searchInput.addEventListener("input", function () {
    runSearch();
  });
}());
