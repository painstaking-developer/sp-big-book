const notesEnabled = checkForTestParameter();
let currentNoteContent = '';
htmx.config.selfRequestsOnly = false;

const notesModule = {
  addEmojiAfterElement(element, emoji = '📝') {
    if (!notesEnabled) return;
    if (!element.querySelector('.notes-toggle')) {
        const emojiSpan = document.createElement('span');
        emojiSpan.textContent = emoji;
        emojiSpan.className = 'notes-toggle';
        element.insertAdjacentElement('afterend', emojiSpan);
    }
  },

  removeEmojiAfterElement() {
      if (!notesEnabled) return;

      const emojiElements = document.querySelectorAll('.notes-toggle');
      emojiElements.forEach(emoji => emoji.remove());
    },

  // adds note related content from document when highlight is added.
  highlightAdded(element) {
    if (!notesEnabled) return;
    element.classList.add('allow-add-note');
    notesModule.addEmojiAfterElement(element);
  },

  // Removes note related content from document when highlight is removed.
  highlightRemoved(highlighted) {
    if (!notesEnabled) return;
    highlighted.classList.remove('allow-add-note');
    notesModule.removeEmojiAfterElement();
  },

  closeExistingNotes() {
    const existingNote = document.querySelector('.note-features');
    if (existingNote) {
        existingNote.remove();
    }
  },

  toggleNoteContent(targetElement) {
    // Check if a note div already exists
    const existingNote = document.querySelector('.note-features');

    // If it exists and is for the same target, remove it (toggle off)
    if (existingNote && existingNote.previousElementSibling === targetElement) {
        existingNote.remove();
        return;
    }

    // Otherwise, remove the existing note (if any) and load new content
    if (existingNote) existingNote.remove();

    // Fetch the external HTML
    fetch('note-content.html')
        .then(response => {
            if (!response.ok) {
                console.error('Failed to load note content:', response.statusText);
                return null;
            }
            return response.text();
        })
        .then(html => {
            if (!html) return;

            // Create a container for the fetched HTML
            const tempContainer = document.createElement('div');
            tempContainer.innerHTML = html;

            // Extract the first element from the fetched HTML
            const noteContent = tempContainer.firstElementChild;

            // Insert the new note content after the target element
            targetElement.insertAdjacentElement('afterend', noteContent);

            // Process the added content with htmx
            htmx.process(noteContent);
        })
        .catch(error => console.error('Error fetching note content:', error));
  },

  saveNote() {
    const current_date = getFormattedDateTime()
    const elementId = window.location.hash.substring(1);
    const elementContent = document.getElementById(elementId).innerHTML;
    // Construct the data to be sent
    const data = {
        text: elementContent,
        id: elementId,
        body: currentNoteContent,
        createdDate: current_date
    };

    fetch(`https://github-commit.avi-777.workers.dev/notes/${elementId}_${current_date}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    })
    .then((response) => {
      if (response.ok) {
        // Success message
        document.getElementById("note-message").textContent = "Note saved successfully!";
      } else {
        // Failure message
        document.getElementById("note-message").textContent = "Error saving note. Please try again.";
      }
    })
    .catch((error) => {
      // Handle errors
      console.error("Error:", error);
      document.getElementById("note-message").textContent = "An unexpected error occurred.";
    });
  }
};

window.notes = notesModule; // Expose the module to the global scope


// Event listener for the emoji button
document.addEventListener('click', (event) => {
    if (!notesEnabled) return;
    if (event.target.classList.contains('notes-toggle')) {
        const highlightedElement = document.querySelector('.notes-toggle');
        if (highlightedElement) {
            notesModule.toggleNoteContent(highlightedElement);
        } else {
            console.error('No highlighted element found');
        }
    }
});

function updateNoteContent(event) {
  currentNoteContent = event.target.value;
}

function getFormattedDateTime() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  const formattedDateTime = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

  return formattedDateTime;
}

saveNote = notesModule.saveNote


function checkForTestParameter() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('test') === 'true';
}