(function () {
  "use strict";

  function normalize(value) {
    return String(value || "").toLowerCase();
  }

  function tokenize(query) {
    return normalize(query).split(/\s+/).filter(Boolean);
  }

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

  function makeSnippet(text, terms) {
    var source = String(text || "").replace(/\s+/g, " ").trim();
    if (!source) {
      return "";
    }

    var lower = normalize(source);
    var first = terms.reduce(function (best, term) {
      var index = lower.indexOf(term);
      return index >= 0 && index < best ? index : best;
    }, source.length);

    if (first === source.length) {
      first = 0;
    }

    var start = Math.max(0, first - 80);
    var end = Math.min(source.length, first + 170);
    var snippet = source.slice(start, end);
    if (start > 0) {
      snippet = "..." + snippet;
    }
    if (end < source.length) {
      snippet += "...";
    }

    var escaped = escapeHtml(snippet);
    terms.forEach(function (term) {
      var pattern = new RegExp("(" + term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "ig");
      escaped = escaped.replace(pattern, "<mark>$1</mark>");
    });
    return escaped;
  }

  function scoreText(text, terms, weight) {
    var lower = normalize(text);
    var score = 0;
    terms.forEach(function (term) {
      var index = lower.indexOf(term);
      if (index >= 0) {
        score += weight;
        if (index < 40) {
          score += Math.round(weight / 2);
        }
      }
    });
    return score;
  }

  function searchArchive(query, limit) {
    var data = window.AW_SEARCH_INDEX || { pages: [], toc: [] };
    var archive = window.AW_ARCHIVE || { issues: [] };
    var terms = tokenize(query);
    var issuesById = Object.create(null);
    var results = [];

    if (!terms.length) {
      return [];
    }

    archive.issues.forEach(function (issue) {
      issuesById[issue.id] = issue;
    });

    data.toc.forEach(function (entry) {
      var titleScore = scoreText(entry.title, terms, 100);
      if (titleScore > 0) {
        results.push({
          type: "toc",
          score: titleScore + 25,
          issue: issuesById[entry.issueId],
          page: entry.page,
          title: entry.title,
          snippet: entry.title
        });
      }
    });

    data.pages.forEach(function (entry) {
      var textScore = scoreText(entry.text, terms, 12);
      var titleScore = scoreText(entry.title, terms, 35);
      if (textScore + titleScore > 0) {
        results.push({
          type: "page",
          score: textScore + titleScore,
          issue: issuesById[entry.issueId],
          page: entry.page,
          title: entry.title || "Page " + entry.page,
          snippet: makeSnippet(entry.text, terms)
        });
      }
    });

    return results
      .filter(function (result) { return result.issue; })
      .sort(function (a, b) {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        if (a.issue.sortKey !== b.issue.sortKey) {
          return a.issue.sortKey < b.issue.sortKey ? -1 : 1;
        }
        return a.page - b.page;
      })
      .slice(0, limit || 40);
  }

  window.AWSearch = {
    search: searchArchive,
    escapeHtml: escapeHtml,
    makeSnippet: makeSnippet
  };
}());
