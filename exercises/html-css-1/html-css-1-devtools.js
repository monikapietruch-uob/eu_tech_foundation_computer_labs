const checklist = document.getElementById("checklist");
const progressText = document.getElementById("progressText");
const progressFill = document.getElementById("progressFill");
const colourButton = document.getElementById("colourButton");
const cssExamples = document.getElementById("cssExamples");

const checkboxes = checklist.querySelectorAll("input[type='checkbox']");
const stepCards = document.querySelectorAll(".step-card");

function updateProgress() {
  let completedTasks = 0;

  checkboxes.forEach(function(checkbox) {
    if (checkbox.checked) {
      completedTasks++;
    }
  });

  const totalTasks = checkboxes.length;
  const percentage = (completedTasks / totalTasks) * 100;

  progressText.textContent = completedTasks + " of " + totalTasks + " tasks completed";
  progressFill.style.width = percentage + "%";

  updateActiveStep(completedTasks);
}

function updateActiveStep(completedTasks) {
  stepCards.forEach(function(stepCard, index) {
    stepCard.classList.remove("active");
    stepCard.classList.remove("completed");

    if (index < completedTasks) {
      stepCard.classList.add("completed");
    }

    if (index === completedTasks && completedTasks < stepCards.length) {
      stepCard.classList.add("active");
    }
  });
}

function toggleCssExamples() {
  cssExamples.classList.toggle("visible");

  if (cssExamples.classList.contains("visible")) {
    colourButton.textContent = "Hide colour examples";
  } else {
    colourButton.textContent = "Show colour examples";
  }
}

checkboxes.forEach(function(checkbox) {
  checkbox.addEventListener("change", updateProgress);
});

colourButton.addEventListener("click", toggleCssExamples);

updateProgress();