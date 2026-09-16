import type { Meta, StoryObj } from '@storybook/react-vite';
import { useId, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Button } from './button';
import { Input } from './input';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle,
} from './field';

const meta = {
  title: 'Shared/UI/Field',
  component: Field,
  args: { orientation: 'vertical' },
  argTypes: {
    orientation: {
      control: 'select',
      options: ['vertical', 'horizontal', 'responsive'],
    },
  },
  decorators: [
    (Story) => (
      <div className='w-form max-w-full'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Field>;
export default meta;
type Story = StoryObj<typeof meta>;

function Example({
  orientation = 'vertical',
  disabled = false,
  invalid = false,
}: {
  orientation?: 'vertical' | 'horizontal' | 'responsive';
  disabled?: boolean;
  invalid?: boolean;
}) {
  const id = useId();
  return (
    <FieldGroup>
      <Field
        orientation={orientation}
        data-disabled={disabled}
        data-invalid={invalid}
      >
        <FieldLabel htmlFor={id}>학습 목표</FieldLabel>
        <FieldContent>
          <Input
            id={id}
            placeholder='매일 단어 20개 복습'
            disabled={disabled}
            aria-invalid={invalid}
            aria-describedby={`${id}-description${invalid ? ` ${id}-error` : ''}`}
          />
          <FieldDescription id={`${id}-description`}>
            다음 시험까지 달성할 목표를 입력하세요.
          </FieldDescription>
          {invalid && (
            <FieldError
              id={`${id}-error`}
              errors={[{ message: '학습 목표를 입력해 주세요.' }]}
            />
          )}
        </FieldContent>
      </Field>
    </FieldGroup>
  );
}
export const Default: Story = {
  render: (args) => <Example orientation={args.orientation ?? 'vertical'} />,
};
export const Horizontal: Story = {
  args: { orientation: 'horizontal' },
  render: (args) => <Example orientation={args.orientation ?? 'vertical'} />,
};
export const Responsive: Story = {
  args: { orientation: 'responsive' },
  render: (args) => <Example orientation={args.orientation ?? 'vertical'} />,
};
export const Disabled: Story = { render: () => <Example disabled /> };
export const Invalid: Story = { render: () => <Example invalid /> };

function GroupExample() {
  const id = useId();
  return (
    <FieldSet>
      <FieldLegend>학습 계획</FieldLegend>
      <FieldDescription>학습 목표와 하루 학습량을 설정합니다.</FieldDescription>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={`${id}-goal`}>목표</FieldLabel>
          <Input id={`${id}-goal`} />
        </Field>
        <FieldSeparator>학습량</FieldSeparator>
        <Field>
          <FieldLabel htmlFor={`${id}-count`}>하루 문항 수</FieldLabel>
          <Input
            id={`${id}-count`}
            type='number'
            min={1}
            defaultValue={10}
          />
        </Field>
        <Field orientation='horizontal'>
          <FieldContent>
            <FieldTitle>적용 시점</FieldTitle>
            <FieldDescription>
              저장한 계획은 다음 학습부터 적용됩니다.
            </FieldDescription>
          </FieldContent>
        </Field>
      </FieldGroup>
    </FieldSet>
  );
}
export const Group: Story = { render: () => <GroupExample /> };
export const MultipleErrors: Story = {
  render: () => (
    <Field data-invalid>
      <FieldTitle>입력 오류</FieldTitle>
      <FieldError
        errors={[
          { message: '목표를 입력하세요.' },
          { message: '하루 문항 수는 1 이상이어야 합니다.' },
        ]}
      />
    </Field>
  ),
};

function FormExample() {
  const id = useId();
  const [saved, setSaved] = useState('');
  const form = useForm({ defaultValues: { goal: '' } });
  return (
    <form
      noValidate
      className='grid gap-section'
      onSubmit={(event) => {
        void form.handleSubmit((values) => setSaved(values.goal))(event);
      }}
    >
      <Controller
        control={form.control}
        name='goal'
        rules={{
          required: '학습 목표를 입력하세요.',
          minLength: { value: 5, message: '5자 이상 입력하세요.' },
        }}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={id}>학습 목표</FieldLabel>
            <Input
              {...field}
              id={id}
              aria-invalid={fieldState.invalid}
              aria-describedby={fieldState.error ? `${id}-error` : undefined}
            />
            {fieldState.error && (
              <FieldError
                id={`${id}-error`}
                errors={[fieldState.error]}
              />
            )}
          </Field>
        )}
      />
      <Button type='submit'>저장</Button>
      <p role='status'>{saved ? `저장한 목표: ${saved}` : ''}</p>
    </form>
  );
}
export const ReactHookForm: Story = { render: () => <FormExample /> };
