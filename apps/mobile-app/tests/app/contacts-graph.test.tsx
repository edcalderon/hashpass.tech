import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';
import ContactsGraph from '../../components/contacts/ContactsGraph';
import type { ContactProfile } from '../../types/contacts';

jest.mock('react-native-svg', () => ({ __esModule: true, default: 'Svg', Circle: 'Circle', Line: 'Line' }));
const people: ContactProfile[] = [
  { id: 'one', name: 'Ari', role: '', company: 'Studio', topics: ['Design'], points: 100, connections: 1, discoverable: false, leaderboard: false },
  { id: 'two', name: 'Robin', role: '', company: 'Guild', topics: ['Community'], points: 100, connections: 1, discoverable: false, leaderboard: false },
  { id: 'three', name: 'Sam', role: '', company: 'Studio', topics: ['Design'], points: 100, connections: 1, discoverable: false, leaderboard: false },
];
const labels = (view: ReactTestRenderer) => view.root.findAllByType(Text).map(node => node.props.children);

describe('Contacts network graph', () => {
  it('lets users select a named contact and exposes the selected state', () => {
    const select = jest.fn();
    let view!: ReactTestRenderer;
    act(() => { view = create(<ContactsGraph contacts={people} topics={[]} grouping="topic" selected="one" mode="dark" onSelect={select} youLabel="YOU" topicLabel={(value: string) => value} />); });
    const node = view.root.findAll(item => item.props.accessibilityLabel === 'Ari' && typeof item.props.onPress === 'function').at(-1)!;
    expect(node.props.accessibilityState.selected).toBe(true);
    act(() => node.props.onPress());
    expect(select).toHaveBeenCalledWith('one');
    const graph = view.root.findAllByProps({ testID: 'contacts-graph' }).at(-1)!;
    act(() => graph.props.onLayout({ nativeEvent: { layout: { width: 300 } } }));
    expect(view.root.findAll(item => item.props.accessibilityRole === 'button' && typeof item.props.onPress === 'function').length).toBeGreaterThanOrEqual(people.length);
    act(() => view.unmount());
  });
  it('switches grouping from translated topics to companies without losing people', () => {
    let view!: ReactTestRenderer;
    act(() => { view = create(<ContactsGraph contacts={people} topics={[]} grouping="topic" selected={null} mode="light" onSelect={() => {}} youLabel="TÚ" topicLabel={(value: string) => value === 'Design' ? 'Diseño' : value} />); });
    expect(labels(view)).toContain('Diseño');
    act(() => view.update(<ContactsGraph contacts={people} topics={[]} grouping="company" selected={null} mode="light" onSelect={() => {}} youLabel="TÚ" topicLabel={(value: string) => value} />));
    expect(labels(view)).toEqual(expect.arrayContaining(['Studio', 'Guild', 'TÚ']));
    expect(labels(view)).not.toContain('Diseño');
    act(() => view.unmount());
  });
  it('renders selected interest orbits without inventing contacts for an empty network', () => {
    let view!: ReactTestRenderer;
    act(() => { view = create(<ContactsGraph contacts={[]} topics={['AI', 'Design']} grouping="topic" selected={null} mode="dark" onSelect={() => {}} youLabel="YOU" topicLabel={(value: string) => value} />); });
    expect(labels(view)).toEqual(expect.arrayContaining(['YOU', 'AI', 'Design']));
    expect(view.root.findAll(item => item.props.accessibilityRole === 'button')).toHaveLength(0);
    act(() => view.unmount());
  });
});
