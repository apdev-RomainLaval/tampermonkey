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
    console.log('Gitea script loaded');

    // #region Constants
    const GITEA_BASE_URL = 'https://git.applidev.fr';
    const GITEA_TOKEN = '7b2c99bd0d9ca3a4fe529d4f3a1b1303246e6d38';
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
    `;
    GM_addStyle(STYLE);
    // #endregion

    const currentUser = await apiRequest('user', 'GET');

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
        $card.on('dblclick', () =>
            globalThis.location.href = $card.find('.issue-card-title').attr('href')
        );
    });
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