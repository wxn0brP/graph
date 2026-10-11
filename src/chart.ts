import { getCache, searchPackages } from "./api";

let chart: any;
declare const Chart: any;

const DEFAULT_ENABLED = [
	"db",
	"db-core",
	"vql",
	"vql-client",
	"falcon-frame",
	"flanker-ui",
];
const RANGES = [
	7,
	30,
	60,
	90,
];

const allPackages: string[] = [];
const packageData: Record<
	string,
	{
		weekly: Record<string, number>;
		enabled: boolean;
		hue: number;
	}
> = {};
const allWeeks: string[] = [];

const statusEl = document.querySelector<HTMLDivElement>("#status");
const controlsEl = document.querySelector<HTMLDivElement>("#controls");
const packagesListEl = document.querySelector<HTMLDivElement>("#packagesList");
const selectedCountEl =
	document.querySelector<HTMLDivElement>("#selectedCount");
const searchBoxEl = document.querySelector<HTMLInputElement>("#searchBox");
const rangeEl = document.querySelector<HTMLDivElement>("#rangeSelect");

const params = new URLSearchParams(window.location.search);
let rangeDays = RANGES.includes(Number(params.get("t")))
	? Number(params.get("t"))
	: 60;
let preEnabled: string[] = DEFAULT_ENABLED;
if (params.has("p")) {
	preEnabled = params.get("p")!.split(",");
}

let hoverPkg: string | null = null;
let initialized = false;

function debounce(fn: () => void, ms: number) {
	let timer: ReturnType<typeof setTimeout>;
	return () => {
		clearTimeout(timer);
		timer = setTimeout(fn, ms);
	};
}

function enabledPackages() {
	return allPackages.filter(pkg => packageData[pkg].enabled);
}

function sameAsDefault(list: string[]) {
	return (
		list.length === DEFAULT_ENABLED.length &&
		DEFAULT_ENABLED.every(p => list.includes(p))
	);
}

function setUrl(sync = true) {
	const url = new URL(window.location.href);
	const selected = enabledPackages().sort();
	if (selected.length === 0 || sameAsDefault(selected)) {
		url.searchParams.delete("p");
	} else {
		url.searchParams.set("p", selected.join(","));
	}
	if (rangeDays === 60) {
		url.searchParams.delete("t");
	} else {
		url.searchParams.set("t", String(rangeDays));
	}
	if (sync) {
		window.history.replaceState(null, "", url);
	}
}

function rangeStr() {
	const endDate = new Date();
	const startDate = new Date();
	startDate.setDate(endDate.getDate() - rangeDays);
	return `${startDate.toISOString().split("T")[0]}:${endDate.toISOString().split("T")[0]}`;
}

function colorOf(pkg: string, dim = false) {
	const { hue } = packageData[pkg];
	return dim ? `hsla(${hue}, 70%, 50%, 0.15)` : `hsl(${hue}, 70%, 50%)`;
}

function assignColors() {
	allPackages.forEach((pkg, index) => {
		packageData[pkg].hue = Math.round((index * 360) / allPackages.length);
	});
}

function setLoading(loading: boolean) {
	document.body.classList.toggle("loading", loading);
	controlsEl.classList.toggle("disabled", loading);
}

async function processSinglePackage(
	fullPkg: string,
	shouldUpdateChart: boolean,
) {
	try {
		const range = rangeStr();
		const data = await getCache(
			`downloads/${range}/${fullPkg}`,
			async (r: string, pkg: string) => {
				const resp = await fetch(
					`https://api.npmjs.org/downloads/range/${r}/${encodeURIComponent(pkg)}`,
				);
				if (!resp.ok) return {};
				return await resp.json();
			},
			range,
			fullPkg,
		);

		if (!data || !data.downloads || !Array.isArray(data.downloads)) return;

		const weekly: Record<string, number> = {};
		data.downloads.forEach((point: { day: string; downloads: number }) => {
			const date = new Date(point.day);
			const weekStart = new Date(date);
			weekStart.setDate(date.getDate() - date.getDay() + 1); // Monday start
			const weekKey = weekStart.toISOString().split("T")[0];
			weekly[weekKey] = (weekly[weekKey] || 0) + point.downloads;
		});

		const name = removePrefix(fullPkg);
		if (Object.keys(weekly).length === 0) return;
		packageData[name].weekly = weekly;

		const weeks = Array.from(
			new Set([
				...allWeeks,
				...Object.keys(weekly),
			]),
		).sort();
		if (
			weeks.length !== allWeeks.length ||
			weeks.some((w, i) => w !== allWeeks[i])
		) {
			allWeeks.length = 0;
			allWeeks.push(...weeks);
		}

		if (shouldUpdateChart) {
			hoverPkg = null;
			updateChart(!initialized ? "none" : "default");
			initialized = true;
		}
	} catch (err) {
		console.warn(`Error for ${fullPkg}:`, err);
	}
}

function updateSelectedCount() {
	selectedCountEl.textContent = enabledPackages().length.toString();
}

function setAll(state: boolean) {
	allPackages.forEach(pkg => {
		packageData[pkg].enabled = state;
		document.querySelector<HTMLInputElement>(`#cb_${pkg}`)!.checked = state;
	});
	updateSelectedCount();
	hoverPkg = null;
	updateChart();
	setUrl();
}

function updateDots() {
	packagesListEl.querySelectorAll<HTMLLabelElement>("label").forEach(label => {
		const pkg = label.dataset.pkg!;
		label.style.setProperty("--c", colorOf(pkg));
	});
}

function updateChart(anim: "default" | "none" = "default") {
	if (!chart) return;
	hoverPkg = null;
	chart.data.labels = allWeeks;
	chart.data.datasets = getDatasets();
	chart.update(anim);
	updateDots();
}

function createChart() {
	const ctx = document
		.querySelector<HTMLCanvasElement>("#downloadsChart")
		.getContext("2d")!;
	chart = new Chart(ctx, getChartConfig());
}

function removePrefix(pkg: string) {
	return pkg.replace("@wxn0brp/", "");
}

function getDatasets() {
	return enabledPackages().map(pkg => {
		const dim = hoverPkg !== null && pkg !== hoverPkg;
		const c = colorOf(pkg, dim);
		const data = allWeeks.map(week => packageData[pkg].weekly[week] || 0);
		return {
			pkg,
			label: pkg,
			data,
			borderColor: c,
			backgroundColor: c,
			fill: false,
			tension: 0.3,
			pointRadius: hoverPkg !== null ? 4 : 3,
			borderWidth: 2,
		};
	});
}

function highlight(pkg: string | null) {
	if (hoverPkg === pkg) return;
	hoverPkg = pkg;
	chart.data.datasets = getDatasets();
	chart.update("none");
}

function getChartConfig() {
	return {
		type: "line",
		data: {
			labels: allWeeks,
			datasets: getDatasets(),
		},
		options: {
			responsive: true,
			animations: {
				colors: false,
				x: {
					duration: 300,
				},
				y: {
					duration: 300,
				},
			},
			onHover: (e: any, elements: any[]) => {
				e.native.target.style.cursor = elements.length ? "pointer" : "default";
				highlight(
					elements.length
						? (chart.data.datasets[elements[0].datasetIndex]?.pkg ?? null)
						: null,
				);
			},
			plugins: {
				title: {
					display: true,
					text: "Weekly Downloads of @wxn0brp/* Packages - Line Chart",
					color: "#ffffff",
				},
				tooltip: {
					mode: "index",
					intersect: false,
					callbacks: {
						label: (ctx: any) => `${ctx.dataset.label}: ${ctx.parsed.y}`,
						footer: (items: any[]) => {
							const total = items.reduce((sum, it) => sum + it.parsed.y, 0);
							return `Total: ${total.toLocaleString()}`;
						},
					},
				},
				legend: {
					position: "right",
					labels: {
						color: "#e0e0e0",
						boxWidth: 12,
						padding: 10,
					},
				},
			},
			scales: {
				x: {
					title: {
						display: true,
						text: "Week (starting Monday)",
						color: "#cccccc",
					},
					ticks: {
						color: "#cccccc",
					},
					grid: {
						color: "#444444",
					},
				},
				y: {
					title: {
						display: true,
						text: "Number of Downloads",
						color: "#cccccc",
					},
					ticks: {
						color: "#cccccc",
					},
					grid: {
						color: "#444444",
					},
					beginAtZero: true,
				},
			},
		},
	};
}

async function loadDownloads(packagesToLoad: string[], priority: string[]) {
	const priorityPackages = packagesToLoad.filter(p =>
		priority.includes(removePrefix(p)),
	);
	const otherPackages = packagesToLoad.filter(
		p => !priority.includes(removePrefix(p)),
	);

	await Promise.all(priorityPackages.map(p => processSinglePackage(p, true)));

	statusEl.textContent = "Ready!";
	statusEl.style.color = "#66ff99";
	setLoading(false);

	for (const pkg of otherPackages) {
		await processSinglePackage(pkg, false);
	}
}

async function initRange() {
	setLoading(true);
	statusEl.textContent = "Fetching download stats...";
	await loadDownloads(
		allPackages.map(pkg => `@wxn0brp/${pkg}`),
		enabledPackages(),
	);
}

function buildPackagesList() {
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
		label.dataset.pkg = pkg;

		div.appendChild(checkbox);
		div.appendChild(label);
		fragment.appendChild(div);
	});
	packagesListEl.innerHTML = "";
	packagesListEl.appendChild(fragment);
	updateDots();
}

document
	.querySelector<HTMLButtonElement>("#selectAll")
	?.addEventListener("click", () => setAll(true));
document
	.querySelector<HTMLButtonElement>("#selectNone")
	?.addEventListener("click", () => setAll(false));

document
	.querySelector<HTMLButtonElement>("#panelToggle")
	?.addEventListener("click", () => {
		controlsEl.classList.toggle("collapsed");
	});

rangeEl?.addEventListener("click", e => {
	const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(
		".range-btn",
	);
	if (!btn || Number(btn.dataset.days) === rangeDays) return;
	rangeDays = Number(btn.dataset.days);
	rangeEl
		.querySelectorAll(".range-btn")
		.forEach(b => b.classList.toggle("active", b === btn));
	setUrl();
	hoverPkg = null;
	if (initialized) {
		allWeeks.length = 0;
		initRange();
	}
});

async function loadData() {
	try {
		statusEl.textContent = "Searching for packages...";
		const packages = await searchPackages();

		if (packages.length === 0) {
			statusEl.textContent = "No packages found in scope @wxn0brp.";
			return;
		}

		statusEl.textContent = `Found ${packages.length} packages. Initializing...`;

		packages.forEach(pkg => {
			const name = removePrefix(pkg);
			allPackages.push(name);
			packageData[name] = {
				weekly: {},
				enabled: preEnabled.includes(name),
				hue: 0,
			};
		});
		allPackages.sort();
		assignColors();

		buildPackagesList();
		controlsEl.style.display = "block";
		rangeEl
			.querySelectorAll(".range-btn")
			.forEach(b =>
				b.classList.toggle(
					"active",
					Number((b as HTMLElement).dataset.days) === rangeDays,
				),
			);
		updateSelectedCount();
		createChart();

		searchBoxEl.addEventListener(
			"input",
			debounce(() => {
				const term = searchBoxEl.value.toLowerCase();
				document.querySelectorAll(".package-item").forEach(item => {
					const label = item.querySelector("label")!;
					const text = label.textContent!.toLowerCase();
					(item as HTMLElement).style.display = text.includes(term)
						? "flex"
						: "none";
				});
			}, 150),
		);

		packagesListEl.addEventListener("change", e => {
			if ((e.target as HTMLInputElement).type === "checkbox") {
				const pkg = (e.target as HTMLInputElement).dataset.pkg!;
				packageData[pkg].enabled = (e.target as HTMLInputElement).checked;
				updateSelectedCount();
				hoverPkg = null;
				updateChart();
				setUrl();
			}
		});

		statusEl.textContent = "Fetching download stats...";
		await initRange();
		statusEl.textContent = "Ready! Use checkboxes to show/hide packages.";
		statusEl.style.color = "#66ff99";
	} catch (err: any) {
		console.error(err);
		statusEl.textContent = "Error: " + err.message;
		setLoading(false);
	}
}

loadData();
