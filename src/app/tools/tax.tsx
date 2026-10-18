import React, { useState } from 'react';
import { View } from 'react-native';
import { useTheme } from '../../theme';
import { Block, Card, Field, Note, Screen, Section, Segmented, StatTile, T, Toggle } from '../../components/ui';
import { compensationTax, eightPercent, selfEmployedGraduated } from '../../lib/phtax';
import { compactPeso, peso, toCentavos } from '../../lib/money';

type Mode = 'employee' | 'self' | 'eight';

function Line({ label, value, strong, color }: { label: string; value: string; strong?: boolean; color?: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <T v={strong ? 'semi' : 'medium'} color={strong ? c.ink : c.muted}>{label}</T>
      <T v={strong ? 'num' : 'semi'} color={color}>{value}</T>
    </View>
  );
}

export default function TaxTool() {
  const { c } = useTheme();
  const [mode, setMode] = useState<Mode>('employee');
  const [employer, setEmployer] = useState<'private' | 'government'>('private');
  const [salary, setSalary] = useState('');
  const [with13th, set13th] = useState(true);
  const [gross, setGross] = useState('');
  const [period, setPeriod] = useState<'month' | 'year'>('month');
  const [osd, setOsd] = useState(true);
  const [expenses, setExpenses] = useState('');

  const monthly = toCentavos(salary || '0') || 0;
  const emp = compensationTax(monthly, employer, with13th);
  const g = toCentavos(gross || '0') || 0;
  const annualGross = period === 'month' ? g * 12 : g;
  const exp = toCentavos(expenses || '0') || 0;
  const self = selfEmployedGraduated(annualGross, osd ? 'osd' : period === 'month' ? exp * 12 : exp);
  const eight = eightPercent(annualGross);
  const better = annualGross > 0 && eight.allowed ? (eight.total <= self.total ? 'eight' : 'self') : null;

  const headline = mode === 'employee' ? emp.monthlyTax : mode === 'self' ? self.monthly : eight.monthly;

  return (
    <Screen title="Tax calculator" subtitle="Philippine income tax and contributions, 2026 rules. An estimate for planning, not a filing." back>
      <Block tone="navy">
        <T v="semi" color={c.navyMuted}>Estimated monthly tax</T>
        <T v="display" color={c.navyText}>{peso(headline)}</T>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
          {(mode === 'employee'
            ? [['Taxable a year', compactPeso(emp.annualTaxable)], ['Take-home a month', compactPeso(emp.netMonthly)]]
            : [['Tax a year', compactPeso(mode === 'self' ? self.total : eight.total)], ['Effective rate', `${(((mode === 'self' ? self.effective : eight.effective) || 0) * 100).toFixed(1)}%`]]
          ).map(([l, v]) => (
            <View key={l} style={{ flex: 1, backgroundColor: c.navyLine, borderRadius: 16, padding: 12 }}>
              <T v="label" color={c.navyMuted}>{l}</T>
              <T v="num" color={c.navyText} style={{ fontSize: 18 }}>{v}</T>
            </View>
          ))}
        </View>
      </Block>

      <View style={{ marginTop: 16 }}>
        <Segmented value={mode} onChange={setMode} options={[['employee', 'Employee'], ['self', 'Self-employed'], ['eight', '8% option']]} />
      </View>

      {mode === 'employee' ? (
        <>
          <View style={{ gap: 14, marginTop: 16 }}>
            <Field label="Monthly basic salary" big value={salary} onChangeText={setSalary} keyboardType="decimal-pad" placeholder="0" />
            <Segmented value={employer} onChange={setEmployer} options={[['private', 'Private (SSS)'], ['government', 'Government (GSIS)']]} />
            <Toggle label="Include 13th-month pay" hint="Tax-free up to ₱90,000 a year with other bonuses." value={with13th} onChange={set13th} />
          </View>
          <Section title="Contributions">
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <StatTile label={emp.socialLabel} value={peso(emp.social)} />
              <StatTile label="PhilHealth" value={peso(emp.philhealth)} />
            </View>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
              <StatTile label="Pag-IBIG" value={peso(emp.pagibig)} />
              <StatTile label="Total" value={peso(emp.total)} />
            </View>
          </Section>
          <Section title="Tax computation">
            <Card style={{ gap: 10 }}>
              <Line label="Taxable a year" value={peso(emp.annualTaxable)} />
              {emp.thirteenthTaxable ? <Line label="13th month over ₱90k" value={peso(emp.thirteenthTaxable)} /> : null}
              <Line label="Income tax a year" value={peso(emp.annualTax)} />
              <Line label="Marginal rate" value={`${emp.marginal * 100}%`} />
              <Line label="Take-home a month" value={peso(emp.netMonthly)} strong color={c.income} />
              <T v="small">{emp.note}</T>
            </Card>
          </Section>
        </>
      ) : (
        <>
          <View style={{ gap: 14, marginTop: 16 }}>
            <Segmented value={period} onChange={setPeriod} options={[['month', 'Per month'], ['year', 'Per year']]} />
            <Field label={`Gross receipts ${period === 'month' ? 'a month' : 'a year'}`} big value={gross} onChangeText={setGross} keyboardType="decimal-pad" placeholder="0"
              hint="Everything clients paid you, before expenses." />
            {mode === 'self' ? (
              <>
                <Toggle label="Use 40% standard deduction (OSD)" hint="Simplest: no receipts needed. Turn off to enter your actual expenses." value={osd} onChange={setOsd} />
                {!osd ? <Field label={`Business expenses ${period === 'month' ? 'a month' : 'a year'}`} value={expenses} onChangeText={setExpenses} keyboardType="decimal-pad" placeholder="0" /> : null}
              </>
            ) : null}
          </View>
          <Section title="Tax computation">
            <Card style={{ gap: 10 }}>
              <Line label="Gross a year" value={peso(annualGross)} />
              <Line label="Taxable" value={peso(mode === 'self' ? self.annualTaxable : eight.annualTaxable)} />
              {mode === 'self' ? <Line label="Income tax" value={peso(self.incomeTax)} /> : null}
              {mode === 'self' ? <Line label="3% percentage tax" value={peso(self.percentageTax)} /> : null}
              <Line label="Total a year" value={peso(mode === 'self' ? self.total : eight.total)} strong />
              <T v="small">{mode === 'self' ? self.note : eight.note}</T>
            </Card>
          </Section>
          {better ? (
            <View style={{ marginTop: 14 }}>
              <Note tone="good" icon="lightbulb-on-outline">{better === 'eight'
                ? `The 8% option saves about ${peso(self.total - eight.total, { cents: false })} a year here. You choose it when you register or in your first quarterly return.`
                : `Graduated rates save about ${peso(eight.total - self.total, { cents: false })} a year here, usually because of high expenses.`}</Note>
            </View>
          ) : null}
          <T v="small" style={{ marginTop: 12 }}>If you also earn a salary, the ₱250,000 deduction under the 8% option doesn’t apply to your side income.</T>
        </>
      )}
    </Screen>
  );
}
