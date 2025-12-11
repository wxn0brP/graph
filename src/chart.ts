import { getCache, searchPackages } from "./api";

let chart: any;
declare const Chart: any;

const allPackages: string[] = [];
const packageData: Record<
    string,
    {
        weekly: Record<string, number>;
        enabled: boolean;
        color?: string;
    }
> = {}
const allWeeks: string[] = [];

const statusEl = document.querySelector<HTMLDivElement>("#status");
const controlsEl = document.querySelector<HTMLDivElement>("#controls");
const packagesListEl = document.querySelector<HTMLDivElement>("#packagesList");
const selectedCountEl = document.querySelector<HTMLDivElement>("#selectedCount");

let preEnabled = [
    "db",
    "db-core",
    "vql",
    "vql-client",
    "falcon-frame",
    "flanker-ui",
]
const params = new URLSearchParams(window.location.search);
if (params.has("p")) preEnabled = params.get("pre")!.split(",");

async function loadData() {
    try {
        statusEl.textContent = "Searching for packages...";
        const packages = await searchPackages();

        if (packages.length === 0) {
            statusEl.textContent = "No packages found in scope @wxn0brp.";
            return;
        }

        statusEl.textContent = `Found ${packages.length} packages. Fetching download stats...`;

        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - 60);
        const range = `${startDate.toISOString().split("T")[0]}:${endDate.toISOString().split("T")[0]}`;

        const weeksSet = new Set<string>();

        for (const pkg of packages) {
            try {
                const data = await getCache(pkg, async (range, pkg) => {
                    const resp = await fetch(`https://api.npmjs.org/downloads/range/${range}/${encodeURIComponent(pkg)}`);
                    if (!resp.ok) return {};
                    const data = await resp.json();
                    return data;
                }, range, pkg);

                if (!data || !data.downloads || !Array.isArray(data.downloads)) continue;

                const weekly: Record<string, number> = {};

                data.downloads.forEach((point: { day: string, downloads: number }) => {
                    const date = new Date(point.day);
                    const weekStart = new Date(date);
                    weekStart.setDate(date.getDate() - date.getDay() + 1); // Monday start
                    const weekKey = weekStart.toISOString().split("T")[0];
                    weekly[weekKey] = (weekly[weekKey] || 0) + point.downloads;
                    weeksSet.add(weekKey);
                });

                if (Object.keys(weekly).length > 0) {
                    const name = pkg.replace("@wxn0brp/", "");
                    allPackages.push(name);
                    packageData[name] = { weekly, enabled: preEnabled.includes(name) };
                }
            } catch (err) {
                console.warn(`Error for ${pkg}:`, err);
            }
        }

        if (allPackages.length === 0) {
            statusEl.textContent = "No download data available for any package.";
            return;
        }

        allWeeks.push(...Array.from(weeksSet).sort());

        const fragment = document.createDocumentFragment();
        allPackages.forEach(pkg => {
            const div = document.createElement("div");
            div.className = "package-item";

            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.id = "cb_" + pkg;
            checkbox.checked = packageData[pkg].enabled;
            checkbox.dataset.pkg = pkg;

            const label = document.createElement("label");
            label.htmlFor = "cb_" + pkg;
            label.textContent = pkg;

            div.appendChild(checkbox);
            div.appendChild(label);
            fragment.appendChild(div);
        });
        packagesListEl.innerHTML = "";
        packagesListEl.appendChild(fragment);
        controlsEl.style.display = "block";

        updateSelectedCount();
        createChart();

        document.querySelector<HTMLInputElement>("#searchBox").addEventListener("input", e => {
            const term = (e.target as HTMLInputElement).value.toLowerCase();
            document.querySelectorAll(".package-item").forEach(item => {
                const label = item.querySelector("label")!;
                const text = label.textContent!.toLowerCase();
                (item as HTMLElement).style.display = text.includes(term) ? "flex" : "none";
            });
        });

        packagesListEl.addEventListener("change", e => {
            if ((e.target as HTMLInputElement).type === "checkbox") {
                const pkg = (e.target as HTMLInputElement).dataset.pkg!;
                packageData[pkg].enabled = (e.target as HTMLInputElement).checked;
                updateSelectedCount();
                updateChart();
            }
        });

        statusEl.textContent = "Ready! Use checkboxes to show/hide packages.";
        statusEl.style.color = "#66ff99";

    } catch (err: any) {
        console.error(err);
        statusEl.textContent = "Error: " + err.message;
    }
}

function updateSelectedCount() {
    const count = allPackages.filter(pkg => packageData[pkg].enabled).length;
    selectedCountEl.textContent = count.toString();
}

function createChart() {
    const ctx = document.querySelector<HTMLCanvasElement>("#downloadsChart").getContext("2d")!;
    chart = new Chart(ctx, getChartConfig());
}

function updateChart() {
    chart.data.datasets = getDatasets();
    chart.update();
}

function getDatasets() {
    const visiblePackages = allPackages.filter(pkg => packageData[pkg].enabled);

    visiblePackages.forEach((pkg, index) => {
        const hue = (index * 360 / visiblePackages.length);
        packageData[pkg].color = `hsl(${hue}, 70%, 50%)`;
    });

    return visiblePackages.map(pkg => {
        const data = allWeeks.map(week => packageData[pkg].weekly[week] || 0);
        return {
            label: pkg,
            data: data,
            borderColor: packageData[pkg].color,
            backgroundColor: packageData[pkg].color,
            fill: false,
            tension: 0.3,
            pointRadius: 3,
            borderWidth: 2
        };
    });
}

function getChartConfig() {
    return {
        type: "line",
        data: {
            labels: allWeeks,
            datasets: getDatasets()
        },
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: "Weekly Downloads of @wxn0brp/* Packages - Line Chart",
                    color: "#ffffff"
                },
                tooltip: {
                    mode: "index",
                    intersect: false
                },
                legend: {
                    position: "right",
                    labels: {
                        color: "#e0e0e0",
                        boxWidth: 12,
                        padding: 10
                    }
                }
            },
            scales: {
                x: {
                    title: { display: true, text: "Week (starting Monday)", color: "#cccccc" },
                    ticks: { color: "#cccccc" },
                    grid: { color: "#444444" }
                },
                y: {
                    title: { display: true, text: "Number of Downloads", color: "#cccccc" },
                    ticks: { color: "#cccccc" },
                    grid: { color: "#444444" },
                    beginAtZero: true
                }
            }
        }
    };
}

loadData();
