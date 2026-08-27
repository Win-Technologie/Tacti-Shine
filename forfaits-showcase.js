/*
    forfaits-showcase.js

    Remplit les sections de tarification de la page
    d'accueil avec les VRAIS forfaits tirés de la base de
    données — plus de contenu fictif codé en dur.

    Chaque service en base a un champ "display_section"
    (édité depuis /admin/services) qui dit où il doit
    apparaître :
      - 'forfaits'  -> #forfaits (petits véhicules) ET
                       #forfaits-vus (gros véhicules) — le
                       même service apparaît une fois dans
                       chaque section, avec le prix propre
                       à cette taille de véhicule.
      - 'ceramique' -> #ceramique-grid
      - null        -> n'apparaît nulle part sur le site,
                       visible seulement dans le widget de
                       réservation

    Chaque carte affiche une FOURCHETTE de prix (option la
    moins chère à la plus chère — ex: extérieur seul à
    complet), pas seulement le prix du forfait complet.

    Le champ "type" regroupe des forfaits similaires ENTRE
    EUX au sein d'une section — utilisé ici seulement pour
    la section céramique.

    Si une section n'a plus aucun service actif, elle est
    masquée en entier sur le site — pas juste une grille
    vide avec un titre orphelin.

    Aucun id de service n'est codé en dur ici — ajouter un
    nouveau forfait et lui donner une display_section
    depuis l'admin le fait apparaître ici automatiquement,
    sans toucher au code.
*/

(async function renderForfaitsShowcase() {

    const smallGrid = document.getElementById("forfaits-petits-grid");
    const smallSection = document.getElementById("forfaits");
    const bigGrid = document.getElementById("forfaits-gros-grid");
    const bigSection = document.getElementById("forfaits-vus");
    const ceramiqueGrid = document.getElementById("ceramique-grid");
    const ceramiqueSection = document.getElementById("ceramique");

    if (!smallGrid && !bigGrid && !ceramiqueGrid) {
        return; // pas sur cette page
    }

    try {

        const response = await fetch("/api/services");

        if (!response.ok) {
            throw new Error("Réponse non-OK de /api/services");
        }

        const data = await response.json();

        const forfaitsServices = data.services.filter(
            s => s.displaySection === "forfaits"
        );

        const ceramiqueServices = data.services.filter(
            s => s.displaySection === "ceramique"
        );

        renderSection(smallGrid, smallSection, () => {
            renderTieredGrid(smallGrid, forfaitsServices, "small");
        }, forfaitsServices.length > 0);

        renderSection(bigGrid, bigSection, () => {
            renderTieredGrid(bigGrid, forfaitsServices, "big");
        }, forfaitsServices.length > 0);

        renderSection(ceramiqueGrid, ceramiqueSection, () => {
            renderFlatGrid(ceramiqueGrid, ceramiqueServices);
        }, ceramiqueServices.length > 0);

    } catch (error) {

        console.error("Impossible de charger les forfaits:", error);

        const errorHtml = `
            <p style="color:#e07a5f;">
                Impossible de charger les forfaits pour le moment.
            </p>
        `;

        if (smallGrid) smallGrid.innerHTML = errorHtml;
        if (bigGrid) bigGrid.innerHTML = errorHtml;
        if (ceramiqueGrid) ceramiqueGrid.innerHTML = errorHtml;
    }


    /*
        Cache la section en entier (titre, note compris) si
        elle n'a aucun service actif — sinon la remplit.
    */

    function renderSection(grid, section, renderFn, hasServices) {

        if (!grid) {
            return;
        }

        if (!hasServices) {

            if (section) {
                section.style.display = "none";
            }

            return;
        }

        if (section) {
            section.style.display = "";
        }

        renderFn();
    }


    /*
        Grille à paliers (Hivernale/Sergent/Major) — prix
        affiché en fourchette (option la moins chère à la
        plus chère) pour la taille de véhicule de cette
        section. Triés par durée croissante côté serveur,
        donc l'ordre ici correspond déjà à Hivernale ->
        Sergent -> Major.
    */

    function renderTieredGrid(container, services, vehicleSize) {

        container.innerHTML = services.map((service, index) => {

            const prices = service.pricing
                .filter(p => p.vehicleSize === vehicleSize)
                .map(p => p.price);

            const priceLabel = formatPriceRange(prices);

            return `
                <div class="prix-card${index === services.length - 1 ? " featured" : ""}">
                    <div class="pk-head">
                        <div class="pk-rank">Niveau ${String(index + 1).padStart(2, "0")}</div>
                        <div class="pk-name">${escapeHtml(service.name)}</div>
                        <div class="pk-prix range">${priceLabel}<span>+ tx</span></div>
                    </div>
                    <div class="pk-body">
                        ${featuresOrDescription(service)}
                    </div>
                    <div class="pk-foot"><a href="#reserver">Réserver ce forfait</a></div>
                </div>
            `;
        }).join("");
    }


    /*
        Grille à prix fixe (ex: Entretien Annuel) — même
        prix peu importe la taille du véhicule. Le libellé
        au-dessus du nom vient du champ "type" en base.
    */

    function renderFlatGrid(container, services) {

        container.innerHTML = services.map(service => `
            <div class="prix-card">
                <div class="pk-head">
                    <div class="pk-rank">${escapeHtml(service.type ? capitalize(service.type) : "Entretien")}</div>
                    <div class="pk-name">${escapeHtml(service.name)}</div>
                    <div class="pk-prix">${service.flatPrice !== null ? service.flatPrice.toFixed(0) + " $" : "—"}<span>+ tx</span></div>
                </div>
                <div class="pk-body">
                    ${featuresOrDescription(service)}
                </div>
                <div class="pk-foot"><a href="#reserver">Réserver ce forfait</a></div>
            </div>
        `).join("");
    }


    /*
        Fourchette de prix — "89 $ – 149 $" si les options
        varient, ou juste "149 $" si un seul prix existe
        pour cette taille de véhicule.
    */

    function formatPriceRange(prices) {

        if (prices.length === 0) {
            return "—";
        }

        const min = Math.min(...prices);
        const max = Math.max(...prices);

        if (min === max) {
            return `${min.toFixed(0)} $`;
        }

        return `${min.toFixed(0)} $ – ${max.toFixed(0)} $`;
    }


    function capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }


    function featuresOrDescription(service, paragraphClass) {

        if (service.features && service.features.length) {
            return `<ul>${service.features.map(f => `<li>${escapeHtml(f)}</li>`).join("")}</ul>`;
        }

        const cls = paragraphClass ? ` class="${paragraphClass}"` : "";

        return `<p${cls} style="color:#9aa094;font-size:0.9rem;line-height:1.5;">${escapeHtml(service.description)}</p>`;
    }


    function escapeHtml(str) {
        const div = document.createElement("div");
        div.textContent = str || "";
        return div.innerHTML;
    }

})();