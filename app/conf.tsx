import type { Settings } from "./settings";
import { FIELDS, toQuery } from "./share";
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
				className="mt-2 flex flex-wrap items-end gap-2"
				onSubmit={(e) => {
					e.preventDefault();
					const next = {
						...settings,
						...Object.fromEntries(
							[...new FormData(e.currentTarget)].map(([k, v]) => [
								k,
								Number(v),
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
				{FIELDS.map(([name, label, min, max]) => (
					<label key={name} className="flex flex-col gap-1">
						{label}
						<input
							name={name}
							type="number"
							step="any"
							min={min}
							max={max}
							required
							defaultValue={settings[name]}
							className="w-28 border border-white bg-black px-1 py-0.5 text-sm"
						/>
					</label>
				))}
				<button className="border border-white px-2 py-0.5 text-sm">
					Apply
				</button>
				{/* Unnamed, so FormData skips it; applies instantly without a refetch. */}
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
			</form>
			<p className="mt-2">Scroll or pinch to zoom · drag to pan</p>
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
		</details>
	);
}
