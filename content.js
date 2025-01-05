function createButton(label) {
  const newButton = document.createElement("button");
  newButton.textContent = label;
  newButton.style.cssText = `
        cursor: pointer;
        color: rgb(255, 255, 255);
        width: 100%;
        background: rgb(118, 118, 118);
        border: 1px solid rgb(92, 92, 92);
        outline: none;
        cursor: pointer;
        text-transform: none;
        opacity: 1;
        font-family: var(--font-open-sans),Open Sans,sans-serif;
        font-weight: 400;
        font-size: 8px;
        line-height: 1.5;
        display: inline-flex;
    `;

  newButton.addEventListener("click", () => {
    const textField = document.querySelector("form textarea");
    if (textField) {
      textField.value = label;
    }
  });

  return newButton;
}

function createButtons(options) {
  const buttonContainer = document.createElement("div");
  buttonContainer.style.cssText = `
        display: flex;
        flex-wrap: wrap;
        margin-top: 10px;
    `;

  options.forEach((option) => {
    buttonContainer.appendChild(createButton(option));
  });

  return buttonContainer;
}

function createOptions() {
   const details = document.querySelector('div.question-detail');
   const txt = details.innerText;
    const options = [txt];
    console.log(options);
    return options;
}

const interval = setInterval(() => {
  const targetButton = document.querySelector("form button");
  if (targetButton) {
    clearInterval(interval);
    const options = createOptions();
    targetButton.parentNode.insertBefore(
      createButtons(options),
      targetButton.nextSibling
    );
  }
}, 100);
