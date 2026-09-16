import type { Meta, StoryObj } from '@storybook/react-vite';
import { BookOpenIcon, HistoryIcon, HomeIcon } from 'lucide-react';
import { useState } from 'react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuBadge,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
  SidebarRail,
} from './sidebar';
const links = [
  { label: '학습 홈', icon: HomeIcon },
  { label: '내 단어장', icon: BookOpenIcon },
  { label: '학습 기록', icon: HistoryIcon },
];
function Example({
  defaultOpen = true,
  side = 'left',
}: {
  defaultOpen?: boolean;
  side?: 'left' | 'right';
}) {
  const [selected, setSelected] = useState('학습 홈');
  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <Sidebar
        collapsible='icon'
        side={side}
      >
        <SidebarHeader>
          <SidebarInput
            aria-label='학습 자료 검색'
            placeholder='검색'
          />
        </SidebarHeader>
        <SidebarSeparator />
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>학습 메뉴</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {links.map(({ label, icon: Icon }) => (
                  <SidebarMenuItem key={label}>
                    <SidebarMenuButton
                      isActive={selected === label}
                      onClick={() => setSelected(label)}
                      tooltip={label}
                    >
                      <Icon />
                      <span>{label}</span>
                    </SidebarMenuButton>
                    {label === '내 단어장' && (
                      <SidebarMenuBadge>3</SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton disabled>
                <span>계정 설정</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        <header className='flex items-center gap-cluster border-b p-page'>
          <SidebarTrigger aria-label='학습 메뉴 열기 또는 닫기' />
          <h1 className='text-heading'>{selected}</h1>
        </header>
        <p className='p-page'>
          메뉴를 선택하거나 사이드바를 접어보세요. 좁은 화면에서는 버튼으로
          메뉴를 열 수 있습니다.
        </p>
      </SidebarInset>
    </SidebarProvider>
  );
}
const meta = {
  title: 'Shared/UI/Sidebar',
  parameters: { layout: 'fullscreen' },
  tags: ['!autodocs'],
} satisfies Meta;
export default meta;
type Story = StoryObj;
export const Default: Story = { name: '펼침', render: () => <Example /> };
export const Collapsed: Story = {
  name: '아이콘으로 접힘',
  render: () => <Example defaultOpen={false} />,
};
export const Right: Story = {
  name: '오른쪽',
  render: () => <Example side='right' />,
};
