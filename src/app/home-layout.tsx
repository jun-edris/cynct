import React from 'react';
import { View } from 'react-native';
import { useData } from '../data/DataContext';
import { useTheme } from '../theme';
import { Button, IconBubble, IconButton, List, Row, Screen, T } from '../components/ui';
import { setSetting } from '../db/repo';
import { HOME_SECTIONS, move, readLayout, type HomeLayout, type HomeSection } from '../lib/home';

export default function HomeLayoutScreen() {
  const { c } = useTheme();
  const { data, act } = useData();
  const layout = readLayout(data.settings.homeLayout);
  const save = (l: HomeLayout) => act(db => setSetting(db, 'homeLayout', l));
  const toggle = (k: HomeSection, hidden: boolean) => save({ ...layout, hidden: hidden ? layout.hidden.filter(x => x !== k) : [...layout.hidden, k] });
  const info = (k: HomeSection) => HOME_SECTIONS.find(s => s.key === k)!;

  return (
    <Screen title="Home layout" subtitle="Show, hide and reorder what’s on your Home screen." back>
      <List>
        {layout.order.map((k, i) => {
          const hidden = layout.hidden.includes(k);
          return (
            <Row key={k} left={<IconBubble icon={info(k).icon} color={hidden ? c.faint : c.mango} />} title={info(k).label}
              sub={hidden ? 'Hidden' : 'Shown'} onPress={() => toggle(k, hidden)}
              right={<View style={{ flexDirection: 'row', gap: 4 }}>
                <IconButton name={hidden ? 'eye-off-outline' : 'eye-outline'} label={hidden ? `Show ${info(k).label}` : `Hide ${info(k).label}`} size={38}
                  onPress={() => toggle(k, hidden)} />
                <IconButton name="chevron-up" label={`Move ${info(k).label} up`} size={38} onPress={() => i > 0 && save(move(layout, k, -1))} />
                <IconButton name="chevron-down" label={`Move ${info(k).label} down`} size={38} onPress={() => i < layout.order.length - 1 && save(move(layout, k, 1))} />
              </View>} />
          );
        })}
      </List>
      <T v="small" style={{ marginTop: 12 }}>Warnings (missing exchange rates, backups) always show after your first section.</T>
      <Button variant="secondary" label="Reset to default" style={{ marginTop: 14 }} onPress={() => act(db => setSetting(db, 'homeLayout', null), 'Home layout reset')} />
    </Screen>
  );
}
