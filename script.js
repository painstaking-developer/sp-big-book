function highlightParagraph() {
    // Remove existing highlights
    const highlighted = document.querySelector('.highlight');
    if (highlighted) {
        highlighted.classList.remove('highlight');
    }

    // Highlight the new paragraph
    const hash = window.location.hash;
    if (hash) {
        const element = document.querySelector(hash);
        if (element) {
            element.classList.add('highlight');
            // Scroll up slightly
            const offset = 50; // Adjust this value as needed
            const topPosition = element.getBoundingClientRect().top + window.scrollY - offset;
            window.scrollTo({ top: topPosition });
        }
    }
}

document.addEventListener("DOMContentLoaded", highlightParagraph);
window.addEventListener("hashchange", highlightParagraph);

window.addEventListener('scroll', function() {
    const headers = document.querySelectorAll('header');
    headers.forEach(header => {
        const rect = header.getBoundingClientRect();
        if (rect.top <= 0) {
            header.classList.add('shadow');
        } else {
            header.classList.remove('shadow');
        }
    });
});

document.addEventListener('dblclick', function (event) {
    // Get the element that was double-clicked
    const targetElement = event.target;

    // Get the ID of the clicked element
    const elementId = targetElement.id; // Get the current element ID

    // Only proceed if the element has an ID
    if (elementId) {
        // Get the current URL without the fragment identifier
        const currentUrl = window.location.href.split('#')[0];

        // Construct the target URL by appending the element ID as a fragment
        const targetUrl = `${currentUrl}#${elementId}`;

        // Redirect to the constructed URL
        window.location.href = targetUrl;

        // Copy the target URL (with the element ID) to the clipboard
        navigator.clipboard.writeText(targetUrl)
            .then(() => {
                console.log('URL copied to clipboard:', targetUrl);
            })
            .catch(err => {
                console.error('Failed to copy: ', err);
            });
    }
});
