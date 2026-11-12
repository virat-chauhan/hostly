import Meter from './Meter';
import { fmtMb } from '../format';

export default function UsageSummary({ usage }) {
  if (!usage) return <div className="summary placeholder" />;
  const { quota, totals } = usage;
  return (
    <div className="summary">
      <Meter
        label="CPU"
        value={totals.cpuCores}
        max={quota.cpu}
        text={`${totals.cpuCores.toFixed(2)} of ${quota.cpu} cores`}
        sub="Shared by all running projects"
      />
      <Meter
        label="Memory"
        value={totals.memMb}
        max={quota.ramMb}
        text={`${fmtMb(totals.memMb)} of ${fmtMb(quota.ramMb)}`}
        sub={`${fmtMb(totals.allocatedMb)} reserved by running projects`}
      />
      <Meter
        label="Storage"
        value={totals.storageMb}
        max={quota.storageMb}
        text={`${fmtMb(totals.storageMb)} of ${fmtMb(quota.storageMb)}`}
        sub="Images, uploads and container files"
      />
    </div>
  );
}
