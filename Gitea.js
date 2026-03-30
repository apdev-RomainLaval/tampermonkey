// ==UserScript==
// @name         Gitea
// @namespace    http://tampermonkey.net/
// @version      3
// @description  try to take over the world!
// @author       You
// @match        https://git.applidev.fr/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=applidev.fr
// @require      https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js
// @grant        GM_addStyle
// ==/UserScript==

(async function() {
    'use strict';

    await import('https://unpkg.com/ninja-keys?module');

    console.log('Gitea script loaded');

    // #region Constants
    const GITEA_BASE_URL = 'https://git.applidev.fr';
    const GITEA_TOKEN = '';
    const GITEA_API_URL = `${GITEA_BASE_URL}/api/v1/`;
    
    const PullRequestStatus = {
        REVIEWS_NEEDED: 'ReviewsNeeded',
        APPROVED: 'ReadyToMerge',
        CHANGES_REQUESTED: 'ChangesRequested'
    };
    const PullRequestStatusColors = {
        [PullRequestStatus.REVIEWS_NEEDED]: '#fff3cd',
        [PullRequestStatus.APPROVED]: '#d4edda',
        [PullRequestStatus.CHANGES_REQUESTED]: '#f8d7da'
    };
    const PullRequestStatesIcons = {
        APPROVED: '✅',
        REQUEST_CHANGES: '❌',
        COMMENT: '💬'
    }

    const STYLE = `
        #issue-list .flex-item {
            .flex-item-trailing {
                align-self: end;
                margin-bottom: 8px;
                margin-right: 8px !important;
            }
        }

        .applidev-popup {
            background-color: white;
            box-shadow: var(--github-shadow-floating-small)!important;
            border-radius: 12px;
            padding: 8px;
        }

        .ninja-title {
            margin-left: 8px !important;
        }
    `;
    GM_addStyle(STYLE);
    // #endregion

    // #region Keyboard
    let hoveredIssueUrl;
    $(document).on('keydown', (e) => {
        switch (e.key) {
            case 'l': {
                if (hoveredIssueUrl) {
                    showIssueLabelsPicker(hoveredIssueUrl);
                }
                break;
            }
        }
    });
    // #endregion

    const currentUser = await apiRequest('user', 'GET');

    // #region Command Palette
    $('body').append('<ninja-keys> </ninja-keys>');
    const commandPalette = document.querySelector('ninja-keys');
    commandPalette.data = [
        {
            id: 'repos',
            title: 'Open Repositories',
            icon: '<svg viewBox="0 0 16 16" class="svg octicon-repo" aria-hidden="true" width="24" height="24"><path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.5 2.5 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.5 2.5 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.25.25 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z"></path></svg>',
            children: []
        },
        {
            id: 'prs',
            title: 'Open Pull Requests',
            icon: '<svg viewBox="0 0 16 16" class="text svg octicon-git-pull-request" aria-hidden="true" width="24" height="24"><path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25m5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354M3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5m0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5m8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0"></path></svg>',
            children: ['all-prs', 'my-prs']
        },
        {
            id: 'all-prs',
            parent: 'prs',
            title: 'All Pull Requests',
            handler: () => globalThis.location.href = 'https://git.applidev.fr/pulls'
        },
        {
            id: 'my-prs',
            parent: 'prs',
            title: 'My Pull Requests',
            handler: () => globalThis.location.href = 'https://git.applidev.fr/pulls?type=created_by&sort=recentupdate&state=open'
        }
    ]

    function setPaletteChildren(parentId, children) {;
        const parentItem = commandPalette.data.find(item => item.id === parentId);
        if (parentItem) {
            // Remove existing children to avoid duplicates
            commandPalette.data = commandPalette.data.filter(item => item.parent !== parentId);
            // Add new children
            commandPalette.data.push(...children);

            parentItem.children = children.map(c => c.id);
        }

        commandPalette.data = [...commandPalette.data];
    }


    commandPalette.addEventListener('selected', async (e) => {
        const { id } = e.detail.action;

        switch (id) {
            case 'repos': {
                const repos = await apiRequest('repos/search', 'GET', { limit: 500 });
                setPaletteChildren('repos', repos.data.map(repo => ({
                    id: `repo-${repo.id}`,
                    title: repo.full_name,
                    parent: 'repos',
                    handler: () => globalThis.location.href = repo.html_url
                })));
                commandPalette.setParent('repos');
                break;
            }
            default:
                break;
        }
    });
    // #endregion

    // #region Pull Request Table
    let pullRequestsData;
    if (globalThis.location.pathname.includes('/pulls')) {
        pullRequestsData = await apiRequest('repos/issues/search', 'GET', { type: 'pulls' });
        waitForElement('#issue-list > .flex-item', customizePullRequestRow)
    }

    // Main method to customize the pull request row
    async function customizePullRequestRow($row) {
        const number = $row.find('.flex-item-title > a').attr('href').split('/').pop();
        const data = pullRequestsData.find(pr => pr.number == number);
        if (!data) return;
        const fullData = await apiRequest(
            `repos/${data.repository.full_name}/pulls/${number}/reviews`,
            'GET'
        );

        const reviews = treatPullRequestReviews(fullData);

        if (reviews.some(review => review.user?.id == currentUser.id && review.state === 'REQUEST_REVIEW')) {
            $row.css('border', '2px solid #004085');
        } else if (
            data.user.id === currentUser.id
            || reviews.some(review => review.user?.id === currentUser.id)
        ) {
            $row.css('opacity', '0.4');
        }

        applyPullRequestStatusStyle($row, getPullRequestStatus(reviews));
        generatePullRequestStatesSummary($row, reviews);
    }

    function treatPullRequestReviews(reviews) {
        // get unique reviews by user (keep the most recent one)
        return Object.values(Object.groupBy(reviews, review => review.user?.id))
            .map(reviews => reviews.toSorted((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at))[0]);
    }

    // #region Pull Request Row Customization
    function applyPullRequestStatusStyle($row, status) {
        $row.css('background-color', PullRequestStatusColors[status]);
    }

    function getPullRequestStatus(data) {
        if (data.some(review => review.state === 'REQUEST_CHANGES')) {
            return PullRequestStatus.CHANGES_REQUESTED;
        }

        if (data.filter(review => review.state === 'APPROVED').length >= 2) {
            return PullRequestStatus.APPROVED;
        }

        return PullRequestStatus.REVIEWS_NEEDED;
    }

    function generatePullRequestStatesSummary($row, reviews) {
        const summary = reviews.reduce((acc, review) => {
            if (!['APPROVED', 'REQUEST_CHANGES', 'COMMENT'].includes(review.state)) {
                return acc;
            }

            if (!acc[review.state]) {
                acc[review.state] = 0;
            }
            acc[review.state]++;
            return acc;
        }, {});

        $row
            .css('position', 'relative')
            .append(`
            <div style="position: absolute; top: 8px; right: 8px; display: flex; gap: 8px;">
                ${Object.entries(summary).map(([state, count]) => `
                    <div style="display: flex; align-items: center; gap: 4px;">
                        <div>${PullRequestStatesIcons[state] || '❓'}</div>
                        <div>${count}</div>
                    </div>
                `).join('')}
            </div>
        `)
    }
    // #endregion
    // #endregion

    // #region Repository Page
    if (globalThis.location.pathname.endsWith('/projects')) {
        waitForElement('.milestone-card > h3 a', ($link) => {
            globalThis.location.href = $link.attr('href');
        });
    }
    // #endregion

    // #region Project Kanban
    waitForElement('.issue-card', ($card) => {
        $card
            .on('dblclick', () =>
                globalThis.location.href = $card.find('.issue-card-title').attr('href')
            )
            .on('mouseenter', () => hoveredIssueUrl = $card.find('.issue-card-title').attr('href'))
            .on('mouseleave', () => hoveredIssueUrl = null);
    });

    async function showIssueLabelsPicker(issueUrl) {
        console.log('Show labels picker for', issueUrl);
        const issueData = await apiRequest(`repos/${issueUrl}`, 'GET');
        const labels = await apiRequest(`repos/${issueData.repository.full_name}/labels`, 'GET');

        const $picker = $(`
                <div class="applidev-popup" style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 1000;">
                    <h3>Labels</h3>
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        ${labels.map(label => `
                            <label style="display: flex; align-items: center; gap: 8px;">
                                <input type="checkbox" value="${label.name}" ${issueData.labels.some(l => l.name === label.name) ? 'checked' : ''}>
                                <span class="ui label" style="border: 1px solid #${label.color};">${label.name}</span>
                            </label>
                        `).join('')}
                    </div>
                    <button data-action="close" class="ui small basic button" style="margin-top: 8px;">Close</button>
                </div>
        `);

        $picker.find('input[type="checkbox"]').on('change', function() {
            const selectedLabels = $picker.find('input[type="checkbox"]:checked').map((_, checkbox) => $(checkbox).val()).get();
            apiRequest(`repos/${issueUrl}/labels`, "PUT", { labels: selectedLabels });
        });

        $picker.find('button[data-action="close"]').on('click', () => {
            $picker.remove();
        });

        $('body').append($picker);
    }
    // #endregion

    // #region Issue Page
    if (globalThis.location.pathname.includes('/issues/')) {
        const $pageInfo = $('#issue-page-info');
        const issueData = await apiRequest(`repos${$pageInfo.data('issue-repo-link')}/issues/${$pageInfo.data('issue-index')}`, 'GET');

        waitForElement('.issue-title', ($title) => {
            $title.find('.issue-title-buttons').prepend(`
                <button id="copy-issue-branch-name" class="ui small basic button">
                    Copy branch name
                </button>
            `);

            $('#copy-issue-branch-name').off('click').on('click', () => {
                const cleanedIssueTitle = issueData.title
                    .toLowerCase()
                    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remove accents
                    .replaceAll(/[^a-zA-Z0-9\s]/g, '') // Remove special characters except spaces
                    .trim()
                    .replaceAll(/\s+/g, '-'); // Replace spaces with dashes

                const branchName = `${issueData.assignee.login}/${cleanedIssueTitle}-#${issueData.number}`;
                navigator.clipboard.writeText(branchName);
            });
        });
    }
    // #endregion

    // #region Utils
    function apiRequest(endpoint, method, data = {}) {
        console.log(`API Request: ${method} ${endpoint}`, data);
        if (endpoint.startsWith('/')) {
            endpoint = endpoint.substring(1);
        }
        return $.ajax({
            url: `${GITEA_API_URL}${endpoint}`,
            method: method,
            headers: {
                'Authorization': `token ${GITEA_TOKEN}`
            },
            data: method === 'GET' ? data : JSON.stringify(data),
            contentType: 'application/json'
        });
    }
    // #endregion
    // Your code here...
})();

// #region Wait for key element
function waitForElement(
    selector,
    callback,
    onlyFirstMatch,
    iframeSelector
) {
    let $target, isTargetsFound;

    if (iframeSelector === undefined) {
        $target = $(selector);
    } else {
        $target = $(iframeSelector).contents().find(selector);
    }

    if ($target && $target.length > 0) {
        isTargetsFound = true;

        $target.each(async function () {
            const $this = $(this);
            const alreadyFound = $this.data('alreadyFound') || false;

            if (!alreadyFound) {
                const cancelFound = await callback($this);
                if (cancelFound) {
                    isTargetsFound = false;
                } else {
                    $this.data('alreadyFound', true);
                }
            }
        });
    }
    else {
        isTargetsFound = false;
    }

    // Get the timer-control variable for this selector.
    const controlObj = waitForElement.controlObj || {};
    const controlKey = selector.replaceAll(/[^\w]/g, "_");
    let timeControl = controlObj[controlKey];

    // Now set or clear the timer as appropriate.
    if (isTargetsFound && onlyFirstMatch && timeControl) {
        // The only condition where we need to clear the timer.
        clearInterval(timeControl);
        delete controlObj[controlKey];
    }
    else if (!timeControl) {
        // Set a timer, if needed.
        timeControl = setInterval(function () {
            waitForElement(
                selector,
                callback,
                onlyFirstMatch,
                iframeSelector
            );
        }, 300);
        controlObj[controlKey] = timeControl;
    }
    waitForElement.controlObj = controlObj;
}
// #endregion