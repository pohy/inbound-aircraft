import type { Settings } from "./settings";
import { FIELDS, toQuery } from "./share";
import { shown, typed, unit } from "./units";
import { HOME } from "./view";

export function Conf({
	settings,
	setSettings,
}: {
	settings: Settings;
	setSettings: (s: Settings) => void;
}) {
	const { lat, lon, radius } = settings;
	const shareUrl = `${location.origin}${location.pathname}?${toQuery(settings)}`;

	return (
		<details className="fixed top-2 left-2 text-xs opacity-50 open:opacity-100">
			<summary className="cursor-pointer list-none text-sm [&::-webkit-details-marker]:hidden">
				CONF
			</summary>
			<form
				className="mt-2"
				onSubmit={(e) => {
					e.preventDefault();
					const data = new FormData(e.currentTarget);
					const next = {
						...settings,
						...Object.fromEntries(
							FIELDS.map(([name, , , , u]) => [
								name,
								typed(
									Number(data.get(name)),
									settings[name],
									unit(u, settings.metric)[1],
								),
							]),
						),
					};
					// A new point or radius starts from the fit-to-radius view.
					setSettings(
						next.lat === lat && next.lon === lon && next.radius === radius
							? next
							: { ...next, view: HOME },
					);
				}}
			>
				<fieldset className="flex flex-wrap items-end gap-2 border-t border-white/30 mb-4">
					<legend className="mb-1 pr-2 font-bold tracking-widest uppercase">
						Radar
					</legend>
					{FIELDS.map(([name, label, min, max, stored]) => {
						const [u, f] = unit(stored, settings.metric);
						return (
							<label key={name} className="flex flex-col gap-1">
								{u ? `${label} (${u})` : label}
								<input
									key={String(settings.metric)} // remounts on a unit switch, so an edited input can't keep the old unit's number
									name={name}
									type="number"
									step="any"
									min={shown(min, f)}
									max={shown(max, f)}
									required
									defaultValue={shown(settings[name], f)}
									className="w-28 border border-white bg-black px-1 py-0.5 text-sm"
								/>
							</label>
						);
					})}
					<button className="border border-white px-2 py-0.5 text-sm">
						Apply
					</button>
				</fieldset>
				{/* Checkboxes apply instantly, without a refetch. */}
				<fieldset className="mt-2 flex flex-wrap gap-2 border-t border-white/30 mb-4">
					<legend className="mb-1 pr-2 font-bold tracking-widest uppercase">
						Display
					</legend>
					<label className="flex items-center gap-1 text-sm">
						<input
							type="checkbox"
							checked={settings.onlyAirborne}
							onChange={(e) =>
								setSettings({ ...settings, onlyAirborne: e.target.checked })
							}
						/>
						Only airborne
					</label>
					<label className="flex items-center gap-1 text-sm">
						<input
							type="checkbox"
							checked={settings.metric}
							onChange={(e) =>
								setSettings({ ...settings, metric: e.target.checked })
							}
						/>
						Metric
					</label>
				</fieldset>
			</form>
			{/* A fieldset outside the form, only to share the legend-in-the-line look. */}
			<fieldset className="mt-2 border-t border-white/30 mb-4">
				<legend className="mb-1 pr-2 font-bold tracking-widest uppercase">
					Info
				</legend>
				<p>Scroll or pinch to zoom · drag to pan</p>
				{/* Plain link: copy it to share. Opening it reloads with this config. */}
				<a href={shareUrl} className="mt-2 block break-all underline">
					{shareUrl}
				</a>
				<a
					href="https://github.com/pohy/inbound-aircraft"
					target="_blank"
					rel="noreferrer"
					className="mt-2 block underline"
				>
					github.com/pohy/inbound-aircraft
				</a>
			</fieldset>
		</details>
	);
}
