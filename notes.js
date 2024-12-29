const notesEnabled = checkForTestParameter();
let currentNoteContent = '';
htmx.config.selfRequestsOnly = false;
let notesById = {};

window.addEventListener('load', () => {
    const storedNotes = localStorage.getItem('notesById');
    if (storedNotes) {
        notesById = JSON.parse(storedNotes);
        notes.placeNoteToggles();
    }
});

const notesModule = {
  addEmojiAfterElement(element, emoji = '💭') {
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
      emojiElements.forEach(emoji => {
          const previousElement = emoji.previousElementSibling;
          if (previousElement && !notesById.hasOwnProperty(previousElement.id)) {
              emoji.remove();
          }
      });
    },

  elementAlreadyHasToggleBtn(element) {
    const nextSibling = element.nextElementSibling;
    return nextSibling && nextSibling.classList.contains('notes-toggle');
  },

  // adds note related content from document when highlight is added.
  highlightAdded(element) {
    if (!notesEnabled) return;
//    element.classList.add('allow-add-note');
    if (!notes.elementAlreadyHasToggleBtn(element)) {
        notesModule.addEmojiAfterElement(element);
    }
  },

  // Removes note related content from document when highlight is removed.
  highlightRemoved(highlighted) {
    if (!notesEnabled) return;
//    highlighted.classList.remove('allow-add-note');
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

    const previousElement = targetElement.previousElementSibling;

    if (previousElement) {
        const previousElementId = previousElement.id;
        if (Object.keys(notesById).includes(previousElementId)) {
            console.log(`ID ${previousElementId} found in notesById.`);
            const currentNotes = notesById[previousElementId].map(i => i.contents);
            console.log(currentNotes);

            // Create a container for the fetched HTML
            const tempContainer = document.createElement('div');
            tempContainer.classList.add('note-features');

            // Add the button to the top of the container
            const button = document.createElement('button');
            button.setAttribute('hx-get', 'note-content.html');
            button.setAttribute('hx-target', '.note-features');
            button.setAttribute('hx-swap', 'outerHTML');
            button.textContent = 'Add New Note';
            tempContainer.appendChild(button);

            // Loop through notes and append each to the container
            currentNotes.forEach((child, index) => {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = child;

                const markdownTable = tempDiv.querySelector('markdown-accessiblity-table');
                if (markdownTable) {
                    markdownTable.remove();
                }

                tempContainer.appendChild(tempDiv);

                // Add <hr> if there are more notes and this is not the last one
                if (index < currentNotes.length - 1) {
                    const hr = document.createElement('hr');
                    tempContainer.appendChild(hr);
                }
            });

            // Insert the new note content after the target element
            targetElement.insertAdjacentElement('afterend', tempContainer);

            // Process the added content with htmx
            htmx.process(tempContainer);

        } else {
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
        }
    }
  },

  saveNote() {
    const current_date = getFormattedDateTime()
    const elementId = window.location.hash.substring(1);
    const elementContent = document.getElementById(elementId).innerHTML;
    // Construct the data to be sent
    const data = {
        text: elementContent.replace(/\r?\n|\r/g, '\\n'),
        id: elementId,
        body: currentNoteContent,
        createdDate: current_date
    };

    const noteTextarea = document.getElementById("note-textarea");
    const noteSaveBtn = document.getElementById("note-save-btn");
    noteMsg = document.getElementById("note-message");
    noteTextarea.disabled = true;
    noteSaveBtn.disabled = true;
    noteMsg.textContent = "Submitting";

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
        noteMsg.textContent = "Note saved successfully!";
        noteMsg.style.color = "green";
        notes.getNotes();
      } else {
        // Failure message
        noteMsg.textContent = "Error saving note.";
        noteMsg.style.color = "red";

        // Re-enable all elements in the form
        noteTextarea.disabled = false;
        noteSaveBtn.disabled = false;
      }
    })
    .catch((error) => {
      // Handle errors
      console.error("Error:", error);
      noteMsg.textContent = "An unexpected error occurred.";
      noteMsg.style.color = "red";
      // Re-enable all elements in the form
      noteTextarea.disabled = false;
      noteSaveBtn.disabled = false;
    })
  },

  async getNotes() {
    const url = "https://github-commit.avi-777.workers.dev/list";
    console.log(url)

    try {
      // Fetch the data from the API
      const response = await fetch(url, { method: "GET" });

      if (!response.ok) {
        throw new Error(`Error: ${response.status} ${response.statusText}`);
      }

      // Parse the JSON response
      const data = await response.json();

      // Set the data in a variable
      const rawNotes = data;

      notesById = rawNotes.reduce((acc, note) => {
          if (!acc[note.id]) {
              acc[note.id] = [];
          }
          acc[note.id].push(note);
          return acc;
      }, {});


      // Save the data in localStorage
      localStorage.setItem("notesById", JSON.stringify(notesById));

      notes.placeNoteToggles();

      console.log("Commits fetched and saved:", notesById);
    } catch (error) {
      console.error("Failed to fetch commits:", error);
      throw error;
    }
  },

  placeNoteToggles() {
    Object.keys(notesById).forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            if (!notes.elementAlreadyHasToggleBtn(element)) {
                notesModule.addEmojiAfterElement(element);
            }
        }
    });
  }
};

window.notes = notesModule; // Expose the module to the global scope


// Event listener for the emoji button
document.addEventListener('click', (event) => {
    if (!notesEnabled) return;
    if (event.target.classList.contains('notes-toggle')) {
        notesModule.toggleNoteContent(event.target);
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

function checkForTestParameter() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('test') === 'true';
}

notesModule.getNotes().then((theNotes) => {
  //
}).catch((err) => {
  console.log(err)
});