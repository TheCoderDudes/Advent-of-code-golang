import { useState } from 'react'
import type { Settings } from '../types'
import { Field, Sheet, Toggle } from '../components/ui'
import { LVCC } from '../lib/defaults'
import { useStore, wipeEverything } from '../state/store'

const NumberSetting = ({
  label,
  hint,
  value,
  min = 0,
  onChange,
  testId,
}: {
  label: string
  hint?: string
  value: number
  min?: number
  onChange: (value: number) => void
  testId: string
}) => (
  <Field label={label} hint={hint}>
    <div className="flex items-center gap-2">
      <button
        type="button"
        className="tap-secondary w-16 shrink-0 text-2xl"
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        −
      </button>
      <input
        className="field flex-1 text-center"
        inputMode="numeric"
        data-testid={testId}
        value={value}
        onChange={(e) => onChange(Math.max(min, Number(e.target.value.replace(/\D/g, '')) || 0))}
      />
      <button
        type="button"
        className="tap-secondary w-16 shrink-0 text-2xl"
        onClick={() => onChange(value + 1)}
      >
        +
      </button>
    </div>
  </Field>
)

export const SettingsScreen = () => {
  const { state, dispatch } = useStore()
  const settings = state.settings
  const [confirmWipe, setConfirmWipe] = useState(false)

  const update = (patch: Partial<Settings>) => dispatch({ type: 'updateSettings', settings: patch })
  const updateTemplate = (key: keyof Settings['templates'], value: string) =>
    update({ templates: { ...settings.templates, [key]: value } })

  return (
    <div className="space-y-6">
      <section className="card space-y-4">
        <h2 className="text-xl font-black">Addresses</h2>
        <Field label="Suite address" hint="Hotel + suite number. Used for every navigation link.">
          <input
            className="field"
            data-testid="suite-address"
            placeholder="e.g. Wynn Las Vegas, 3131 S Las Vegas Blvd — Suite 1204"
            value={settings.suiteAddress}
            onChange={(e) => update({ suiteAddress: e.target.value })}
          />
        </Field>
        <Field label="Convention center address">
          <input
            className="field"
            value={settings.conventionCenterAddress}
            onChange={(e) => update({ conventionCenterAddress: e.target.value })}
          />
        </Field>
        {settings.conventionCenterAddress !== LVCC ? (
          <button
            type="button"
            className="tap-ghost w-full text-base"
            onClick={() => update({ conventionCenterAddress: LVCC })}
          >
            Reset to Las Vegas Convention Center
          </button>
        ) : null}
      </section>

      <section className="card space-y-4">
        <h2 className="text-xl font-black">Timing</h2>
        <NumberSetting
          label="Default appointment duration (min)"
          value={settings.defaultDurationMinutes}
          min={5}
          testId="setting-duration"
          onChange={(v) => update({ defaultDurationMinutes: v })}
        />
        <NumberSetting
          label="Estimated drive time one-way (min)"
          value={settings.driveTimeMinutes}
          testId="setting-drive"
          onChange={(v) => update({ driveTimeMinutes: v })}
        />
        <NumberSetting
          label="Buffer (min)"
          value={settings.bufferMinutes}
          testId="setting-buffer"
          onChange={(v) => update({ bufferMinutes: v })}
        />
        <NumberSetting
          label="Extra minutes per additional stop"
          hint="Added to leave-by when a run has more than one pickup point."
          value={settings.extraMinutesPerStop}
          testId="setting-extra-stop"
          onChange={(v) => update({ extraMinutesPerStop: v })}
        />
        <Toggle
          label="Round-trip leave-by"
          hint="Off: leave-by = start − drive − buffer, as specced. On: also subtracts the drive out to the pickup, which is what the clock actually does."
          checked={settings.roundTripLeaveBy}
          onChange={(v) => update({ roundTripLeaveBy: v })}
        />
      </section>

      <section className="card space-y-4">
        <h2 className="text-xl font-black">Vehicle &amp; grouping</h2>
        <NumberSetting
          label="Vehicle capacity (passengers)"
          value={settings.vehicleCapacity}
          min={1}
          testId="setting-capacity"
          onChange={(v) => update({ vehicleCapacity: v })}
        />
        <NumberSetting
          label="Auto-group window (min)"
          hint="How close in time two appointments must be to ride together."
          value={settings.groupWindowMinutes}
          testId="setting-window"
          onChange={(v) => update({ groupWindowMinutes: v })}
        />
      </section>

      <section className="card space-y-4">
        <h2 className="text-xl font-black">You</h2>
        <Field label="My name">
          <input
            className="field"
            data-testid="setting-name"
            placeholder="Used in text templates"
            value={settings.driverName}
            onChange={(e) => update({ driverName: e.target.value })}
          />
        </Field>
        <Field label="Vehicle description">
          <input
            className="field"
            value={settings.vehicleDescription}
            onChange={(e) => update({ vehicleDescription: e.target.value })}
          />
        </Field>
      </section>

      <section className="card space-y-4">
        <h2 className="text-xl font-black">Text templates</h2>
        <p className="text-sm text-slate-400">
          Placeholders: {'{contact}'} {'{account}'} {'{me}'} {'{vehicle}'} {'{minutes}'}
        </p>
        {(
          [
            ['etaConventionCenter', 'ETA to convention center'],
            ['onTheWay', 'Heading your way'],
            ['outsideNow', "I'm outside now"],
            ['returnReady', 'Ready to take you back'],
          ] as const
        ).map(([key, label]) => (
          <Field key={key} label={label}>
            <textarea
              className="field py-3"
              rows={3}
              value={settings.templates[key]}
              onChange={(e) => updateTemplate(key, e.target.value)}
            />
          </Field>
        ))}
      </section>

      <section className="card space-y-3">
        <h2 className="text-xl font-black">While driving</h2>
        <Toggle
          label="Keep screen awake"
          hint="Holds the screen on while a leg is in progress."
          checked={settings.keepScreenAwake}
          onChange={(v) => update({ keepScreenAwake: v })}
        />
        <Toggle
          label="Leave-by alert"
          hint="Beeps and vibrates when it's time to go, while the app is open."
          checked={settings.leaveByAlerts}
          onChange={(v) => update({ leaveByAlerts: v })}
        />
      </section>

      <section className="card">
        <h2 className="text-xl font-black text-red-300">Danger zone</h2>
        <button
          type="button"
          className="tap-danger mt-3 w-full"
          data-testid="wipe-open"
          onClick={() => setConfirmWipe(true)}
        >
          Wipe all data
        </button>
      </section>

      <Sheet open={confirmWipe} title="Wipe everything?" onClose={() => setConfirmWipe(false)}>
        <p className="text-lg text-slate-300">
          This deletes every appointment, run and setting on this device. It cannot be undone.
        </p>
        <button
          type="button"
          className="tap-danger w-full"
          data-testid="wipe-confirm"
          onClick={() => {
            wipeEverything(dispatch)
            setConfirmWipe(false)
          }}
        >
          Yes, wipe it all
        </button>
        <button type="button" className="tap-ghost w-full" onClick={() => setConfirmWipe(false)}>
          Keep my data
        </button>
      </Sheet>
    </div>
  )
}
