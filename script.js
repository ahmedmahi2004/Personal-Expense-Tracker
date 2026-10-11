
const API_BASE = "http://127.0.0.1:8000";
const PROFILE_API = `${API_BASE}/profiles`;
const EXPENSE_API = `${API_BASE}/expenses`;
const profileForm = document.getElementById("profileForm");
const profileNameInput = document.getElementById("profileName");
const profileSelect = document.getElementById("profileSelect");
const profileMessage = document.getElementById("profileMessage");
const selectionMessage = document.getElementById("selectionMessage");
const activeProfileName = document.getElementById("activeProfileName");
const profileAvatar = document.getElementById("profileAvatar");

const form = document.getElementById("expenseForm");
const nameInput = document.getElementById("expenseName");
const amountInput = document.getElementById("amount");
const categoryInput = document.getElementById("category");
const dateInput = document.getElementById("date");
const expenseList = document.getElementById("expenseList");
const message = document.getElementById("message");
const addExpenseButton = document.getElementById("addExpenseButton");
let profiles = [];
let expenses = [];
let activeProfileId = null;

function formatMoney(amount) {
    return "টাকা " + Number(amount).toLocaleString("en-BD", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}
function setTodayDate() {
    const now = new Date();

    dateInput.value = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0")
    ].join("-");
}
function showEmptyExpenses(text) {
    expenseList.replaceChildren();
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 5;
    cell.className = "px-4 py-12 text-center text-slate-500";
    cell.textContent = text;
    row.appendChild(cell);
    expenseList.appendChild(row);
}

function updateDashboard() {
    const total = expenses.reduce(
        (sum, expense) => sum + Number(expense.amount),
        0
    );
     const now = new Date();
    const currentMonth =
        now.getFullYear() + "-" +
        String(now.getMonth() + 1).padStart(2, "0");

    const monthlyTotal = expenses
        .filter(expense => expense.date.slice(0, 7) === currentMonth)
        .reduce(
            (sum, expense) => sum + Number(expense.amount),
            0
        );

    document.getElementById("totalExpense").textContent =
        formatMoney(total);

    document.getElementById("monthlyExpense").textContent =
        formatMoney(monthlyTotal);

    document.getElementById("transactionCount").textContent =
        expenses.length;
}
function renderExpenses() {
    expenseList.replaceChildren();

    if (expenses.length === 0) {
        showEmptyExpenses("No expenses yet. Add your first expense!");
    } else {
        expenses.forEach(expense => {
            const row = document.createElement("tr");
            row.className = "border-t border-slate-100";

            const nameCell = document.createElement("td");
            nameCell.className = "px-4 py-4 font-semibold";
            nameCell.textContent = expense.name;

            const categoryCell = document.createElement("td");
            categoryCell.className = "px-4 py-4 text-sm text-slate-500";
            categoryCell.textContent = expense.category;

            const dateCell = document.createElement("td");
            dateCell.className = "px-4 py-4 text-sm text-slate-500";
            dateCell.textContent = expense.date;

            const amountCell = document.createElement("td");
            amountCell.className =
                "px-4 py-4 text-right font-semibold whitespace-nowrap";
            amountCell.textContent = formatMoney(expense.amount);

            const actionCell = document.createElement("td");
            actionCell.className = "px-4 py-4";

            const deleteButton = document.createElement("button");
            deleteButton.type = "button";
            deleteButton.textContent = "Delete";
            deleteButton.className =
                "text-sm font-semibold text-red-600 hover:text-red-800";

            deleteButton.addEventListener("click", () => {
                deleteExpense(expense.id);
            });

            actionCell.appendChild(deleteButton);
            row.append(
                nameCell,
                categoryCell,
                dateCell,
                amountCell,
                actionCell
            );

            expenseList.appendChild(row);
        });
    }

    updateDashboard();
}

function resetDashboard() {
    expenses = [];
    renderExpenses();
}

function updateActiveProfile(profile) {
    activeProfileId = Number(profile.id);
    activeProfileName.textContent = profile.name;
    profileAvatar.textContent = profile.name.charAt(0).toUpperCase();

    selectionMessage.textContent =
        `Currently managing ${profile.name}'s expenses.`;

    message.textContent = "";
    profileMessage.textContent = "";

    form.querySelectorAll("input, select, button").forEach(element => {
        element.disabled = false;
    });

    loadExpenses();
}

async function loadProfiles(preferredProfileId = null) {
    try {
        const response = await fetch(PROFILE_API);

        if (!response.ok) {
            throw new Error("Could not load profiles.");
        }

        profiles = await response.json();

        profileSelect.replaceChildren();

        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = profiles.length
            ? "Choose a profile"
            : "No profiles yet";

        profileSelect.appendChild(placeholder);

        profiles.forEach(profile => {
            const option = document.createElement("option");
            option.value = profile.id;
            option.textContent = profile.name;
            profileSelect.appendChild(option);
        });

        if (profiles.length === 0) {
            activeProfileId = null;
            activeProfileName.textContent = "No Profile Selected";
            profileAvatar.textContent = "?";
            selectionMessage.textContent =
                "Create your first profile to continue.";
            form.querySelectorAll("input, select, button").forEach(element => {
                element.disabled = true;
            });
            resetDashboard();
            showEmptyExpenses("Create or select a profile first.");
            return;
        }

        const chosenProfile = profiles.find(
            profile => Number(profile.id) === Number(preferredProfileId)
        );

        const profileToSelect = chosenProfile || profiles[0];

        profileSelect.value = String(profileToSelect.id);
        updateActiveProfile(profileToSelect);

    } catch (error) {
        profileSelect.replaceChildren();

        const option = document.createElement("option");
        option.value = "";
        option.textContent = "Backend unavailable";
        profileSelect.appendChild(option);

        selectionMessage.textContent =
            "Backend connection failed. Run python app.py first.";

        activeProfileName.textContent = "No Profile Selected";
        profileAvatar.textContent = "?";
        activeProfileId = null;

        form.querySelectorAll("input, select, button").forEach(element => {
            element.disabled = true;
        });

        resetDashboard();
        showEmptyExpenses("Could not connect to the backend.");
    }
}

profileForm.addEventListener("submit", async event => {
    event.preventDefault();

    const name = profileNameInput.value.trim();

    if (!name) {
        profileMessage.textContent = "Please enter your name.";
        profileMessage.className = "mt-3 text-sm text-red-600";
        return;
    }

    const createButton = document.getElementById("createProfileButton");
    createButton.disabled = true;
    profileMessage.textContent = "Creating profile...";
    profileMessage.className = "mt-3 text-sm text-slate-500";

    try {
        const response = await fetch(PROFILE_API, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ name })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || "Could not create profile.");
        }

        const profile = result.profile;

        profileForm.reset();

        await loadProfiles(profile.id);

        profileMessage.textContent = result.message ||
            "Profile created successfully.";
        profileMessage.className = "mt-3 text-sm text-emerald-700";

    } catch (error) {
        profileMessage.textContent = error.message;
        profileMessage.className = "mt-3 text-sm text-red-600";
    } finally {
        createButton.disabled = false;
    }
});

profileSelect.addEventListener("change", () => {
    const selectedId = Number(profileSelect.value);

    const profile = profiles.find(
        item => Number(item.id) === selectedId
    );

    if (!profile) {
        activeProfileId = null;
        activeProfileName.textContent = "No Profile Selected";
        profileAvatar.textContent = "?";
        selectionMessage.textContent = "Select a profile to continue.";

        form.querySelectorAll("input, select, button").forEach(element => {
            element.disabled = true;
        });

        resetDashboard();
        showEmptyExpenses("Select a profile first.");
        return;
    }

    updateActiveProfile(profile);
});

async function loadExpenses() {
    if (!activeProfileId) {
        resetDashboard();
        showEmptyExpenses("Select a profile first.");
        return;
    }

    try {
        const response = await fetch(
            `${EXPENSE_API}?profile_id=${activeProfileId}`
        );

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || "Could not load expenses.");
        }

        expenses = result;
        renderExpenses();
        message.textContent = "";

    } catch (error) {
        message.textContent =
            error.message || "Could not load expenses.";
    }
}

form.addEventListener("submit", async event => {
    event.preventDefault();

    if (!activeProfileId) {
        message.textContent = "Please create or select a profile first.";
        return;
    }

    const name = nameInput.value.trim();
    const amount = Number(amountInput.value);
    const category = categoryInput.value;
    const date = dateInput.value;

    if (!name || !Number.isFinite(amount) || amount <= 0 || !date) {
        message.textContent = "Please enter valid expense details.";
        return;
    }

    addExpenseButton.disabled = true;
    message.textContent = "Saving expense...";

    try {
        const response = await fetch(EXPENSE_API, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                profile_id: activeProfileId,
                name,
                amount,
                category,
                date
            })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || "Could not save expense.");
        }

        form.reset();
        setTodayDate();

        await loadExpenses();

        message.textContent = "Expense added successfully.";
        nameInput.focus();

    } catch (error) {
        message.textContent = error.message;
    } finally {
        addExpenseButton.disabled = false;
    }
});

async function deleteExpense(id) {
    if (!activeProfileId) {
        message.textContent = "Please select a profile first.";
        return;
    }

    if (!confirm("Are you sure you want to delete this expense?")) {
        return;
    }

    try {
        const response = await fetch(
            `${EXPENSE_API}/${id}?profile_id=${activeProfileId}`,
            { method: "DELETE" }
        );

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || "Could not delete expense.");
        }

        await loadExpenses();
        message.textContent = "Expense deleted successfully.";

    } catch (error) {
        message.textContent = error.message;
    }
}

setTodayDate();

form.querySelectorAll("input, select, button").forEach(element => {
    element.disabled = true;
});
loadProfiles();
