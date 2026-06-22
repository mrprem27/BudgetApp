import React from 'react';

export interface TabItem {
  key: string;
  label: string;
}

export interface TabPillsProps {
  /** Tabs as strings or {key,label} objects. */
  tabs: (string | TabItem)[];
  /** The active tab key. */
  value: string;
  onChange?: (key: string) => void;
  style?: React.CSSProperties;
}

/** Segmented pill control (e.g. Today · Month · Year). Active pill fills teal. */
export function TabPills(props: TabPillsProps): JSX.Element;
