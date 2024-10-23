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

            // Check if the element is inside a block with the class "page content"
            const pageContent = element.closest('.p');
            if (pageContent) {
                // Scroll to the middle of the browser window
                const elementPosition = element.getBoundingClientRect().top + window.scrollY;
                const offset = window.innerHeight / 2 - element.clientHeight / 2; // Centering
                const topPosition = elementPosition - offset;
                window.scrollTo(0, topPosition); // No animation
            } else {
                // Original logic: Scroll with a fixed offset
                const offset = 50; // Adjust as needed
                const topPosition = element.getBoundingClientRect().top + window.scrollY - offset;
                window.scrollTo(0, topPosition); // No animation
            }
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
    let elementId = targetElement.id; // Get the current element ID

    // Check if the element does not have an ID, and get the parent ID if necessary
    if (!elementId && targetElement.parentElement) {
        elementId = targetElement.parentElement.id; // Get the parent element ID
    }

    console.log("elementId", elementId)

    // Only proceed if we have an ID
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
