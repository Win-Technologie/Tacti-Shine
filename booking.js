/* =========================================
   BOOKING SYSTEM
========================================= */

const bookingState = {
    step: 1,

    service: null,
    vehicleSize: null,
    cleaningType: null,
    polissage: false,
    price: 0,
    duration: 0,

    date: null,
    startTime: null,
    endTime: null,

    customerName: "",
    phone: "",
    email: "",

    vehicleMake: "",
    vehicleModel: "",
    vehicleYear: "",

    extraInfo: "",

    holdId: null,
    holdExpiresAt: null
};


/*
    TEMPORARY SERVICE DATA

    Later this will come from:

    GET /api/services
*/

/*
    FORFAITS

    Real pricing from the "Tacti Shine QC —
    Forfaits" price sheet. Each forfait has
    its own price per vehicle size (small/big)
    and per cleaning type (interior/exterior/
    complete) — this is NOT a simple multiplier,
    so prices are listed explicitly to match
    the price sheet exactly.

    duration is a PLACEHOLDER — the price sheet
    doesn't list how long each forfait takes.
    Update these once you confirm real times,
    since they control how many slots show up
    on the calendar.
*/

/*
    FORFAITS

    Chargés depuis /api/services au démarrage (voir
    loadServicesFromApi plus bas) — reflète en temps réel
    ce qui est actif dans le panel admin. Le tableau reste
    vide jusqu'à ce que le fetch initial se termine.
*/

let services = [];


/*
    POLISSAGE UNE ÉTAPE (ADD-ON)

    Chargé lui aussi depuis /api/services (le champ
    "addons"). null tant que le fetch initial n'est
    pas terminé, ou s'il n'y a pas d'add-on nommé
    "polissage" actif côté serveur.
*/

let polissageAddon = null;

function isPolissageEligible() {

    if (!bookingState.service || !polissageAddon) {
        return false;
    }

    const eligibleIds = polissageAddon.eligibleServiceIds || [];

    // Une liste vide veut dire "éligible pour tous les services"
    if (eligibleIds.length === 0) {
        return true;
    }

    return eligibleIds.includes(bookingState.service.id);
}


/*
    LOAD SERVICES FROM API

    Va chercher les forfaits et add-ons réels en base,
    convertit la grille de prix plate (pricing: [...])
    en priceMatrix imbriqué (le format que le reste du
    fichier attend déjà), et retourne true/false selon
    le succès.
*/

async function loadServicesFromApi() {

    try {

        const response = await fetch("/api/services");

        if (!response.ok) {
            throw new Error("Réponse non-OK de /api/services");
        }

        const data = await response.json();

        services = data.services.map(service => {

            const converted = {
                id: service.id,
                name: service.name,
                description: service.description,
                duration: service.duration
            };

            if (service.flatPrice !== null) {

                converted.flatPrice = service.flatPrice;

            } else {

                const priceMatrix = { small: {}, big: {} };

                service.pricing.forEach(row => {
                    priceMatrix[row.vehicleSize][row.cleaningType] = row.price;
                });

                converted.priceMatrix = priceMatrix;
            }

            return converted;
        });

        polissageAddon =
            data.addons.find(addon => addon.id === "polissage") || null;

        return true;

    } catch (error) {

        console.error("Impossible de charger les services:", error);

        return false;
    }
}


/*
    VEHICLE SIZE

    Adds extra time to the service
    duration for a bigger vehicle.
    Price itself now comes from each
    forfait's own price matrix (see
    the services list above) since
    real pricing isn't a flat add-on.

    Adjust durationAdd to match your
    real timing.
*/

const vehicleSizes = [
    {
        id: "small",
        name: "Petit véhicule",
        description: "Berline, coupé, hatchback, compacte.",
        durationAdd: 0
    },
    {
        id: "big",
        name: "Grand véhicule",
        description: "VUS, camionnette, fourgonnette.",
        durationAdd: 1
    }
];


/*
    CLEANING TYPE

    Applies a multiplier to the service
    duration depending on the scope of
    the cleaning (a partial job takes
    less time than a complete one).
    Price itself comes from each
    forfait's price matrix.

    Adjust durationMultiplier to match
    your real timing. The id here
    ("interior" / "exterior" / "complete")
    must match the keys used in each
    forfait's priceMatrix.
*/

const cleaningTypes = [
    {
        id: "exterior",
        name: "Extérieur seulement",
        description: "Lavage et soin de la carrosserie uniquement.",
        durationMultiplier: 0.6
    },
    {
        id: "interior",
        name: "Intérieur seulement",
        description: "Nettoyage de l'habitacle uniquement.",
        durationMultiplier: 0.6
    },
    {
        id: "complete",
        name: "Complet",
        description: "Intérieur et extérieur.",
        durationMultiplier: 1
    }
];


/*
    CALCULATE PRICE

    Looks up the exact price for this
    forfait / vehicle size / cleaning
    type combination from the forfait's
    own price matrix.
*/

function calculatePrice(service, vehicleSize, cleaningType) {

    if (!service || !vehicleSize || !cleaningType) {
        return 0;
    }

    const bySize =
        service.priceMatrix[vehicleSize.id];

    if (!bySize) {
        return 0;
    }

    return bySize[cleaningType.id] ?? 0;
}


/*
    CALCULATE PRICE RANGE

    Cheapest and most expensive
    combination found in the forfait's
    price matrix.
*/

function calculatePriceRange(service) {

    if (!service.priceMatrix) {
        return { min: service.flatPrice, max: service.flatPrice };
    }

    const allPrices = [];

    vehicleSizes.forEach(size => {

        const bySize =
            service.priceMatrix[size.id];

        if (!bySize) {
            return;
        }

        cleaningTypes.forEach(type => {

            if (typeof bySize[type.id] === "number") {
                allPrices.push(bySize[type.id]);
            }
        });
    });

    return {
        min: Math.min(...allPrices),
        max: Math.max(...allPrices)
    };
}


/*
    CALCULATE DURATION

    Combines the base service duration
    with the vehicle size add-on and
    the cleaning type multiplier.

    Rounded to the nearest half hour,
    with a 1 hour minimum, since the
    calendar books in half-hour steps
    at most.
*/

function calculateDuration(service, vehicleSize, cleaningType) {

    if (!service || !vehicleSize || !cleaningType) {
        return 0;
    }

    const rawDuration =
        service.duration * cleaningType.durationMultiplier +
        vehicleSize.durationAdd;

    const rounded =
        Math.round(rawDuration * 2) / 2;

    return Math.max(1, rounded);
}


/*
    CALCULATE DURATION RANGE

    Shortest possible combo (smallest
    vehicle add-on + lowest multiplier)
    to the longest combo (largest
    vehicle add-on + highest
    multiplier), for a given service.
*/

function calculateDurationRange(service) {

    if (!service.priceMatrix) {
        return { min: service.duration, max: service.duration };
    }

    const addOns =
        vehicleSizes.map(size => size.durationAdd);

    const multipliers =
        cleaningTypes.map(type => type.durationMultiplier);

    const minAddOn = Math.min(...addOns);
    const maxAddOn = Math.max(...addOns);

    const minMultiplier = Math.min(...multipliers);
    const maxMultiplier = Math.max(...multipliers);

    const min =
        Math.max(1, Math.round((service.duration * minMultiplier + minAddOn) * 2) / 2);

    const max =
        Math.max(1, Math.round((service.duration * maxMultiplier + maxAddOn) * 2) / 2);

    return { min, max };
}


/*
    FORMAT DURATION

    Turns 1.5 into "1h30", 2 into "2h",
    etc. for display.
*/

function formatDuration(hours) {

    const wholeHours = Math.floor(hours);

    const minutes =
        Math.round((hours - wholeHours) * 60);

    if (minutes === 0) {
        return `${wholeHours}h`;
    }

    return `${wholeHours}h${String(minutes).padStart(2, "0")}`;
}


/*
/*
    CALENDAR
*/

let calendarDate = new Date();

calendarDate.setDate(1);

let selectedCalendarDate = null;


/*
    DOM
*/

const servicesList = document.getElementById("services-list");

const serviceNext = document.getElementById("service-next");

const vehicleOptionList = document.getElementById("vehicle-option-list");
const vehicleOptionNext = document.getElementById("vehicle-option-next");

const polissageAddonPanel = document.getElementById("polissage-addon");
const polissageCheckbox = document.getElementById("polissage-checkbox");

const previousMonth = document.getElementById("previous-month");
const nextMonth = document.getElementById("next-month");

const calendarMonth = document.getElementById("calendar-month");
const calendarDays = document.getElementById("calendar-days");

const timeGrid = document.getElementById("time-grid");
const loadingTimes = document.getElementById("loading-times");

const selectedDateLabel =
    document.getElementById("selected-date-label");

const selectedTime =
    document.getElementById("selected-time");

const timeNext =
    document.getElementById("time-next");

const customerForm =
    document.getElementById("customer-form");

const bookingSummary =
    document.getElementById("booking-summary");

const confirmBooking =
    document.getElementById("confirm-booking");

const holdCountdown =
    document.getElementById("hold-countdown");

const confirmationDetails =
    document.getElementById("confirmation-details");

const newBooking =
    document.getElementById("new-booking");


/* =========================================
   INITIALIZE
========================================= */

async function initBooking() {

    servicesList.innerHTML = `
        <p style="color:#888;">Chargement des forfaits...</p>
    `;

    const loaded = await loadServicesFromApi();

    if (!loaded || services.length === 0) {

        servicesList.innerHTML = `
            <p style="color:#e05656;">
                Impossible de charger les forfaits pour le moment.
                Veuillez rafraîchir la page ou réessayer plus tard.
            </p>
        `;

        return;
    }

    renderServices();

    populatePolissagePanelText();

    renderVehicleOptions();

    renderCalendar();
}

initBooking();


/* =========================================
   SERVICES
========================================= */

function renderServices() {

    servicesList.innerHTML = "";

    services.forEach(service => {

        const card = document.createElement("div");

        card.className = "service-card";

        const range =
            calculatePriceRange(service);

        const durationRange =
            calculateDurationRange(service);

        card.innerHTML = `
            <h3>${escapeHtml(service.name)}</h3>

            <p>
                ${escapeHtml(service.description)}
            </p>

            <div class="service-duration">
                ${
                    durationRange.min === durationRange.max
                        ? formatDuration(durationRange.min)
                        : `${formatDuration(durationRange.min)} – ${formatDuration(durationRange.max)}`
                }
            </div>

            <div class="service-price">
                ${
                    range.min === range.max
                        ? range.min.toFixed(2) + " $"
                        : `${range.min.toFixed(2)} $ – ${range.max.toFixed(2)} $`
                }
            </div>
        `;

        card.addEventListener("click", () => {

            document
                .querySelectorAll(".service-card")
                .forEach(item => {
                    item.classList.remove("selected");
                });

            card.classList.add("selected");

            bookingState.service = service;

            serviceNext.disabled = false;
        });

        servicesList.appendChild(card);
    });
}


/* =========================================
   SERVICE NEXT
========================================= */

serviceNext.addEventListener("click", () => {

    if (!bookingState.service) {
        return;
    }

    const service = bookingState.service;


    /*
        Flat-price forfait (e.g. Entretien
        Annuel) — no vehicle size / cleaning
        type to pick, so skip straight to
        the date & time step.
    */

    if (!service.priceMatrix) {

        bookingState.vehicleSize = null;
        bookingState.cleaningType = null;
        bookingState.polissage = false;
        bookingState.price = service.flatPrice;
        bookingState.duration = service.duration;

        const dateBackButton =
            document.querySelector('#step-3 [data-back]');

        if (dateBackButton) {
            dateBackButton.dataset.back = "1";
        }

        const summary =
            document.getElementById("selected-service-summary");

        summary.innerHTML = `
            <strong>${escapeHtml(service.name)}</strong>
            <br>
            ${formatDuration(bookingState.duration)}
            · ${bookingState.price.toFixed(2)} $
        `;

        goToStep(3);

        return;
    }


    const range =
        calculatePriceRange(service);

    document.getElementById("selected-service-summary-2").innerHTML = `
        <strong>${escapeHtml(service.name)}</strong>
        <br>
        à partir de ${range.min.toFixed(2)} $
    `;

    renderVehicleOptions();

    updatePolissageEligibility();

    goToStep(2);
});


/* =========================================
   VEHICLE SIZE + CLEANING TYPE (COMBINED)

    Every combination of vehicle size and
    cleaning type is shown as one card,
    each with its own price, e.g.
    "Petit véhicule · Intérieur" or
    "Grand véhicule · Complet".
========================================= */

function renderVehicleOptions() {

    vehicleOptionList.innerHTML = "";

    vehicleSizes.forEach(size => {

        const group = document.createElement("div");

        group.className = "vehicle-option-group";

        const title = document.createElement("div");

        title.className = "vehicle-option-group-title";

        title.innerHTML = `
            ${escapeHtml(size.name)}
            <small>${escapeHtml(size.description)}</small>
        `;

        const grid = document.createElement("div");

        grid.className = "services-grid";

        cleaningTypes.forEach(type => {

            const card = document.createElement("div");

            card.className = "service-card";

            const price =
                calculatePrice(
                    bookingState.service,
                    size,
                    type
                );

            const duration =
                calculateDuration(
                    bookingState.service,
                    size,
                    type
                );

            card.innerHTML = `
                <h3>${escapeHtml(type.name)}</h3>

                <p>
                    ${escapeHtml(type.description)}
                </p>

                <div class="service-duration">
                    ${bookingState.service ? formatDuration(duration) : ""}
                </div>

                <div class="service-price">
                    ${bookingState.service ? price.toFixed(2) + " $" : ""}
                </div>
            `;

            card.addEventListener("click", () => {

                document
                    .querySelectorAll("#vehicle-option-list .service-card")
                    .forEach(item => {
                        item.classList.remove("selected");
                    });

                card.classList.add("selected");

                bookingState.vehicleSize = size;
                bookingState.cleaningType = type;

                bookingState.price =
                    calculatePrice(
                        bookingState.service,
                        size,
                        type
                    );

                bookingState.duration =
                    calculateDuration(
                        bookingState.service,
                        size,
                        type
                    );

                updatePolissageEligibility();

                vehicleOptionNext.disabled = false;
            });

            grid.appendChild(card);
        });

        group.appendChild(title);
        group.appendChild(grid);

        vehicleOptionList.appendChild(group);
    });
}


/* =========================================
   POLISSAGE ADD-ON

    Shown only when eligible (Sergent or
    Major + an exterior-inclusive cleaning
    type). Toggling it adds its price and
    duration on top of the base selection.
========================================= */

/*
    Rempli le texte du panneau add-on — appelée après
    que loadServicesFromApi() ait chargé polissageAddon
    (ne peut pas s'exécuter au chargement du script,
    puisque polissageAddon est encore null à ce moment).
*/

function populatePolissagePanelText() {

    if (!polissageAddon) {
        return;
    }

    polissageAddonPanel.querySelector("#polissage-addon-name").textContent =
        polissageAddon.name;

    polissageAddonPanel.querySelector("#polissage-addon-description").textContent =
        polissageAddon.description;

    polissageAddonPanel.querySelector("#polissage-addon-price").textContent =
        `+${polissageAddon.price.toFixed(2)} $`;
}


function updatePolissageEligibility() {

    const eligible =
        isPolissageEligible();

    polissageAddonPanel.style.display =
        eligible ? "block" : "none";

    if (!eligible) {

        bookingState.polissage = false;
        polissageCheckbox.checked = false;
    }

    recalculateSelectionTotals();
}


function recalculateSelectionTotals() {

    if (!bookingState.service || !bookingState.vehicleSize || !bookingState.cleaningType) {
        return;
    }

    let price =
        calculatePrice(
            bookingState.service,
            bookingState.vehicleSize,
            bookingState.cleaningType
        );

    let duration =
        calculateDuration(
            bookingState.service,
            bookingState.vehicleSize,
            bookingState.cleaningType
        );

    if (bookingState.polissage) {
        price += polissageAddon.price;
        duration += polissageAddon.duration;
    }

    bookingState.price = price;
    bookingState.duration = duration;
}


polissageCheckbox.addEventListener("change", () => {

    bookingState.polissage = polissageCheckbox.checked;

    recalculateSelectionTotals();
});


/* =========================================
   VEHICLE OPTION NEXT
========================================= */

vehicleOptionNext.addEventListener("click", () => {

    if (!bookingState.vehicleSize || !bookingState.cleaningType) {
        return;
    }

    const dateBackButton =
        document.querySelector('#step-3 [data-back]');

    if (dateBackButton) {
        dateBackButton.dataset.back = "2";
    }

    const summary =
        document.getElementById("selected-service-summary");

    summary.innerHTML = `
        <strong>${escapeHtml(bookingState.service.name)}</strong>
        · ${escapeHtml(bookingState.vehicleSize.name)}
        · ${escapeHtml(bookingState.cleaningType.name)}
        ${bookingState.polissage ? "· " + escapeHtml(polissageAddon.name) : ""}
        <br>
        ${formatDuration(bookingState.duration)}
        · ${bookingState.price.toFixed(2)} $
    `;

    goToStep(3);
});


/* =========================================
   CALENDAR
========================================= */

function renderCalendar() {

    calendarDays.innerHTML = "";

    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();

    calendarMonth.textContent =
        new Intl.DateTimeFormat("fr-CA", {
            month: "long",
            year: "numeric"
        }).format(calendarDate);

    const firstDay =
        new Date(year, month, 1);

    let startDay = firstDay.getDay();

    /*
        Convert Sunday = 0 to
        Monday = 0
    */

    startDay = startDay === 0 ? 6 : startDay - 1;

    const daysInMonth =
        new Date(year, month + 1, 0).getDate();

    const today = new Date();

    today.setHours(0, 0, 0, 0);


    /* Empty days */

    for (let i = 0; i < startDay; i++) {

        const empty =
            document.createElement("div");

        calendarDays.appendChild(empty);
    }


    /* Days */

    for (let day = 1; day <= daysInMonth; day++) {

        const button =
            document.createElement("button");

        button.type = "button";
        button.className = "calendar-day";

        const date =
            new Date(year, month, day);

        date.setHours(0, 0, 0, 0);

        button.textContent = day;


        /* Previous dates */

        if (date < today) {

            button.disabled = true;
        }


        /* Today */

        if (date.getTime() === today.getTime()) {

            button.classList.add("today");
        }


        /* Selected */

        if (
            selectedCalendarDate &&
            date.getTime() === selectedCalendarDate.getTime()
        ) {
            button.classList.add("selected");
        }


        button.addEventListener("click", () => {

            selectDate(date);
        });


        calendarDays.appendChild(button);
    }
}


/* =========================================
   SELECT DATE
========================================= */

function selectDate(date) {

    selectedCalendarDate = new Date(date);

    selectedCalendarDate.setHours(0, 0, 0, 0);

    bookingState.date =
        formatDateForDatabase(selectedCalendarDate);

    bookingState.startTime = null;
    bookingState.endTime = null;

    timeNext.disabled = true;

    selectedTime.classList.remove("visible");

    renderCalendar();

    selectedDateLabel.textContent =
        new Intl.DateTimeFormat("fr-CA", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric"
        }).format(selectedCalendarDate);

    loadAvailableTimes();
}


/* =========================================
   AVAILABLE TIMES
========================================= */

async function loadAvailableTimes() {

    timeGrid.innerHTML = "";

    loadingTimes.style.display = "block";

    loadingTimes.textContent =
        "Chargement des heures disponibles...";


    let availableTimes = [];

    try {

        const params = new URLSearchParams({
            date: bookingState.date,
            serviceId: bookingState.service.id
        });

        if (bookingState.vehicleSize) {
            params.set("vehicleSize", bookingState.vehicleSize.id);
        }

        if (bookingState.cleaningType) {
            params.set("cleaningType", bookingState.cleaningType.id);
        }

        if (bookingState.polissage && polissageAddon) {
            params.set("addonIds", polissageAddon.id);
        }

        const response = await fetch(`/api/availability?${params.toString()}`);

        if (!response.ok) {
            throw new Error("Réponse non-OK de /api/availability");
        }

        const data = await response.json();

        availableTimes = data.availableTimes || [];

    } catch (error) {

        console.error("Impossible de charger les disponibilités:", error);

        loadingTimes.textContent =
            "Impossible de charger les heures disponibles. Veuillez réessayer.";

        return;
    }


    loadingTimes.style.display = "none";

    if (availableTimes.length === 0) {

        loadingTimes.style.display = "block";

        loadingTimes.textContent =
            "Aucune heure disponible pour cette date.";

        return;
    }


    availableTimes.forEach(time => {

        const button =
            document.createElement("button");

        button.type = "button";
        button.className = "time-slot";

        button.textContent = time;

        button.addEventListener("click", () => {

            selectTime(time);
        });

        timeGrid.appendChild(button);
    });
}


/* =========================================
   SELECT TIME
========================================= */

function selectTime(time) {

    document
        .querySelectorAll(".time-slot")
        .forEach(button => {

            button.classList.remove("selected");
        });


    const selectedButton =
        [...document.querySelectorAll(".time-slot")]
            .find(button => button.textContent === time);


    if (selectedButton) {
        selectedButton.classList.add("selected");
    }


    bookingState.startTime = time;

    bookingState.endTime =
        calculateEndTime(
            time,
            bookingState.duration
        );


    selectedTime.innerHTML = `
        <strong>Heure sélectionnée :</strong>
        ${time} → ${bookingState.endTime}
    `;

    selectedTime.classList.add("visible");

    timeNext.disabled = false;
}


/* =========================================
   CALCULATE END TIME
========================================= */

function calculateEndTime(startTime, durationHours) {

    const [hours, minutes] =
        startTime.split(":").map(Number);

    const totalMinutes =
        hours * 60 +
        minutes +
        durationHours * 60;

    const endHours =
        Math.floor(totalMinutes / 60);

    const endMinutes =
        totalMinutes % 60;

    return `${String(endHours).padStart(2, "0")}:${String(endMinutes).padStart(2, "0")}`;
}


/* =========================================
   TIME NEXT
========================================= */

timeNext.addEventListener("click", () => {

    if (
        !bookingState.date ||
        !bookingState.startTime
    ) {
        return;
    }

    goToStep(4);
});


/* =========================================
   CUSTOMER FORM
========================================= */

customerForm.addEventListener("submit", async event => {

    event.preventDefault();

    if (!customerForm.checkValidity()) {

        customerForm.reportValidity();

        return;
    }


    bookingState.customerName =
        document.getElementById("customer-name").value.trim();

    bookingState.phone =
        document.getElementById("customer-phone").value.trim();

    bookingState.email =
        document.getElementById("customer-email").value.trim();

    bookingState.vehicleMake =
        document.getElementById("vehicle-make").value.trim();

    bookingState.vehicleModel =
        document.getElementById("vehicle-model").value.trim();

    bookingState.vehicleYear =
        document.getElementById("vehicle-year").value.trim();

    bookingState.extraInfo =
        document.getElementById("extra-info").value.trim();


    const submitButton =
        customerForm.querySelector('button[type="submit"]');

    submitButton.disabled = true;
    submitButton.textContent = "Verrouillage du créneau...";

    try {

        const payload = {
            date: bookingState.date,
            serviceId: bookingState.service.id,
            vehicleSize: bookingState.vehicleSize ? bookingState.vehicleSize.id : null,
            cleaningType: bookingState.cleaningType ? bookingState.cleaningType.id : null,
            addonIds: bookingState.polissage && polissageAddon ? [polissageAddon.id] : [],
            startTime: bookingState.startTime
        };

        const response = await fetch("/api/holds", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok) {

            if (response.status === 409) {

                alert(
                    data.error || "Ce créneau vient d'être pris. Veuillez en choisir un autre."
                );

                goToStep(3);
                loadAvailableTimes();

            } else {

                alert(data.error || "Une erreur est survenue. Veuillez réessayer.");
            }

            return;
        }

        // Le serveur est la source de vérité pour le prix/la durée
        bookingState.holdId = data.holdId;
        bookingState.holdExpiresAt = new Date(data.expiresAt).getTime();
        bookingState.startTime = data.startTime;
        bookingState.endTime = data.endTime;
        bookingState.duration = data.duration;
        bookingState.price = data.price;

        startHoldCountdown();

        renderBookingSummary();

        goToStep(5);

    } catch (error) {

        console.error("Impossible de verrouiller le créneau:", error);

        alert("Une erreur est survenue. Veuillez réessayer.");

    } finally {

        submitButton.disabled = false;
        submitButton.textContent = "Vérifier la réservation";
    }
});


/* =========================================
   BOOKING SUMMARY
========================================= */

function renderBookingSummary() {

    const date =
        new Intl.DateTimeFormat("fr-CA", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric"
        }).format(selectedCalendarDate);


    bookingSummary.innerHTML = `

        <div class="summary-section">

            <h3>Service</h3>

            <div class="summary-row">
                <span>Service</span>
                <span>
                    ${escapeHtml(bookingState.service.name)}
                </span>
            </div>

            ${
                bookingState.vehicleSize
                    ? `
                        <div class="summary-row">
                            <span>Taille du véhicule</span>
                            <span>
                                ${escapeHtml(bookingState.vehicleSize.name)}
                            </span>
                        </div>
                    `
                    : ""
            }

            ${
                bookingState.cleaningType
                    ? `
                        <div class="summary-row">
                            <span>Type de nettoyage</span>
                            <span>
                                ${escapeHtml(bookingState.cleaningType.name)}
                            </span>
                        </div>
                    `
                    : ""
            }

            ${
                bookingState.polissage
                    ? `
                        <div class="summary-row">
                            <span>Ajout</span>
                            <span>
                                ${escapeHtml(polissageAddon.name)}
                            </span>
                        </div>
                    `
                    : ""
            }

            <div class="summary-row">
                <span>Durée</span>
                <span>
                    ${formatDuration(bookingState.duration)}
                </span>
            </div>

            <div class="summary-row">
                <span>Prix</span>
                <span>
                    ${bookingState.price.toFixed(2)} $
                </span>
            </div>

        </div>


        <div class="summary-section">

            <h3>Date et heure</h3>

            <div class="summary-row">
                <span>Date</span>
                <span>${date}</span>
            </div>

            <div class="summary-row">
                <span>Heure</span>
                <span>
                    ${bookingState.startTime}
                    →
                    ${bookingState.endTime}
                </span>
            </div>

        </div>


        <div class="summary-section">

            <h3>Client</h3>

            <div class="summary-row">
                <span>Nom</span>
                <span>
                    ${escapeHtml(bookingState.customerName)}
                </span>
            </div>

            <div class="summary-row">
                <span>Téléphone</span>
                <span>
                    ${escapeHtml(bookingState.phone)}
                </span>
            </div>

            <div class="summary-row">
                <span>Courriel</span>
                <span>
                    ${escapeHtml(bookingState.email)}
                </span>
            </div>

        </div>


        <div class="summary-section">

            <h3>Véhicule</h3>

            <div class="summary-row">
                <span>Marque</span>
                <span>
                    ${escapeHtml(bookingState.vehicleMake)}
                </span>
            </div>

            <div class="summary-row">
                <span>Modèle</span>
                <span>
                    ${escapeHtml(bookingState.vehicleModel)}
                </span>
            </div>

            <div class="summary-row">
                <span>Année</span>
                <span>
                    ${escapeHtml(bookingState.vehicleYear)}
                </span>
            </div>

        </div>


        ${
            bookingState.extraInfo
                ? `
                    <div class="summary-section">

                        <h3>Informations supplémentaires</h3>

                        <p>
                            ${escapeHtml(bookingState.extraInfo)}
                        </p>

                    </div>
                `
                : ""
        }

    `;
}


let holdTimer = null;


/* =========================================
   HOLD COUNTDOWN
========================================= */

function startHoldCountdown() {

    if (holdTimer) {
        clearInterval(holdTimer);
    }

    updateHoldCountdown();

    holdTimer =
        setInterval(updateHoldCountdown, 1000);
}


function updateHoldCountdown() {

    if (!bookingState.holdExpiresAt) {
        return;
    }

    const remaining =
        bookingState.holdExpiresAt - Date.now();

    if (remaining <= 0) {

        clearInterval(holdTimer);

        holdCountdown.textContent = "00:00";

        confirmBooking.disabled = true;

        alert(
            "Votre réservation temporaire a expiré. Veuillez sélectionner une nouvelle heure."
        );

        goToStep(3);

        return;
    }


    const totalSeconds =
        Math.floor(remaining / 1000);

    const minutes =
        Math.floor(totalSeconds / 60);

    const seconds =
        totalSeconds % 60;

    holdCountdown.textContent =
        `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}


/* =========================================
   CONFIRM BOOKING
========================================= */

confirmBooking.addEventListener("click", async () => {

    confirmBooking.disabled = true;

    confirmBooking.textContent =
        "Confirmation...";


    try {

        const payload = {
            holdId: bookingState.holdId,
            customerName: bookingState.customerName,
            phone: bookingState.phone,
            email: bookingState.email,
            vehicleMake: bookingState.vehicleMake,
            vehicleModel: bookingState.vehicleModel,
            vehicleYear: bookingState.vehicleYear,
            extraInfo: bookingState.extraInfo
        };

        const response = await fetch("/api/bookings/confirm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok) {

            if (response.status === 410) {

                // Le hold a expiré entre-temps
                alert(data.error || "Votre réservation temporaire a expiré. Veuillez recommencer.");

                resetBooking();

                return;
            }

            throw new Error(data.error || "Erreur lors de la confirmation");
        }

        showConfirmation(data.bookingNumber);


    } catch (error) {

        console.error(error);

        alert(
            error.message || "Une erreur est survenue. Veuillez réessayer."
        );

        confirmBooking.disabled = false;

        confirmBooking.textContent =
            "Confirmer la réservation";
    }
});


/* =========================================
   CONFIRMATION
========================================= */

function showConfirmation(bookingNumber) {

    if (holdTimer) {
        clearInterval(holdTimer);
    }


    const date =
        new Intl.DateTimeFormat("fr-CA", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric"
        }).format(selectedCalendarDate);


    const serviceLabelParts = [bookingState.service.name];

    if (bookingState.vehicleSize) {
        serviceLabelParts.push(bookingState.vehicleSize.name);
    }

    if (bookingState.cleaningType) {
        serviceLabelParts.push(bookingState.cleaningType.name);
    }

    if (bookingState.polissage) {
        serviceLabelParts.push(polissageAddon.name);
    }


    confirmationDetails.innerHTML = `

        <div class="booking-summary">

            <div class="summary-section">

                <div class="summary-row">
                    <span>Numéro</span>
                    <span>${bookingNumber}</span>
                </div>

                <div class="summary-row">
                    <span>Service</span>
                    <span>
                        ${serviceLabelParts.map(escapeHtml).join(" · ")}
                    </span>
                </div>

                <div class="summary-row">
                    <span>Prix</span>
                    <span>${bookingState.price.toFixed(2)} $</span>
                </div>

                <div class="summary-row">
                    <span>Date</span>
                    <span>${date}</span>
                </div>

                <div class="summary-row">
                    <span>Heure</span>
                    <span>
                        ${bookingState.startTime}
                        →
                        ${bookingState.endTime}
                    </span>
                </div>

                <div class="summary-row">
                    <span>Véhicule</span>
                    <span>
                        ${escapeHtml(bookingState.vehicleYear)}
                        ${escapeHtml(bookingState.vehicleMake)}
                        ${escapeHtml(bookingState.vehicleModel)}
                    </span>
                </div>

            </div>

        </div>

    `;


    goToStep("success");
}


/* =========================================
   BACK BUTTONS
========================================= */

document
    .querySelectorAll("[data-back]")
    .forEach(button => {

        button.addEventListener("click", () => {

            const step =
                Number(button.dataset.back);

            goToStep(step);
        });
    });


/* =========================================
   STEP NAVIGATION
========================================= */

function goToStep(step) {

    bookingState.step = step;


    document
        .querySelectorAll(".booking-step")
        .forEach(section => {

            section.classList.remove("active");
        });


    const target =
        document.getElementById(
            step === "success"
                ? "step-success"
                : `step-${step}`
        );


    if (target) {
        target.classList.add("active");
    }


    updateProgress(step);
}


/* =========================================
   PROGRESS
========================================= */

function updateProgress(step) {

    const numericStep =
        step === "success" ? 5 : Number(step);


    document
        .querySelectorAll(".progress-step")
        .forEach(item => {

            const itemStep =
                Number(item.dataset.step);

            item.classList.remove(
                "active",
                "completed"
            );


            if (itemStep === numericStep) {

                item.classList.add("active");

            } else if (itemStep < numericStep) {

                item.classList.add("completed");
            }
        });
}


/* =========================================
   MONTH NAVIGATION
========================================= */

previousMonth.addEventListener("click", () => {

    calendarDate.setMonth(
        calendarDate.getMonth() - 1
    );

    renderCalendar();
});


nextMonth.addEventListener("click", () => {

    calendarDate.setMonth(
        calendarDate.getMonth() + 1
    );

    renderCalendar();
});


/* =========================================
   NEW BOOKING
========================================= */

newBooking.addEventListener("click", () => {

    resetBooking();

    goToStep(1);
});


/* =========================================
   RESET
========================================= */

function resetBooking() {

    if (holdTimer) {
        clearInterval(holdTimer);
    }


    bookingState.step = 1;

    bookingState.service = null;
    bookingState.vehicleSize = null;
    bookingState.cleaningType = null;
    bookingState.polissage = false;
    bookingState.price = 0;
    bookingState.duration = 0;

    bookingState.date = null;
    bookingState.startTime = null;
    bookingState.endTime = null;

    bookingState.customerName = "";
    bookingState.phone = "";
    bookingState.email = "";

    bookingState.vehicleMake = "";
    bookingState.vehicleModel = "";
    bookingState.vehicleYear = "";

    bookingState.extraInfo = "";

    bookingState.holdId = null;
    bookingState.holdExpiresAt = null;


    confirmBooking.disabled = false;

    confirmBooking.textContent =
        "Confirmer la réservation";


    selectedCalendarDate = null;


    customerForm.reset();

    serviceNext.disabled = true;
    vehicleOptionNext.disabled = true;
    timeNext.disabled = true;

    selectedTime.classList.remove("visible");

    polissageCheckbox.checked = false;
    polissageAddonPanel.style.display = "none";

    const dateBackButton =
        document.querySelector('#step-3 [data-back]');

    if (dateBackButton) {
        dateBackButton.dataset.back = "2";
    }

    renderServices();
    renderVehicleOptions();
    renderCalendar();
}


/* =========================================
   HELPERS
========================================= */

function formatDateForDatabase(date) {

    const year =
        date.getFullYear();

    const month =
        String(date.getMonth() + 1)
            .padStart(2, "0");

    const day =
        String(date.getDate())
            .padStart(2, "0");

    return `${year}-${month}-${day}`;
}


function wait(ms) {

    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}


function escapeHtml(value) {

    const div =
        document.createElement("div");

    div.textContent =
        value ?? "";

    return div.innerHTML;
}