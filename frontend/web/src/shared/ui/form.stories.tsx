/** Form 조합의 설명·검증 오류·비활성 상태를 실제 입력 흐름으로 검수한다 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { fn } from 'storybook/test';
import { Button } from './button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from './form';
import { Input } from './input';

interface LearningGoalFormValues {
  goal: string;
}

interface FormExampleProps {
  disabled?: boolean;
  invalid?: boolean;
}

const onFormSubmit = fn<(values: LearningGoalFormValues) => void>();

function FormExample({ disabled = false, invalid = false }: FormExampleProps) {
  const form = useForm<LearningGoalFormValues>({
    defaultValues: {
      goal: '',
    },
  });

  useEffect(() => {
    if (invalid) {
      form.setError('goal', {
        message: '학습 목표를 5자 이상 입력해 주세요.',
        type: 'manual',
      });
      return;
    }
    form.clearErrors('goal');
  }, [form, invalid]);

  return (
    <Form {...form}>
      <form
        className='grid w-form gap-section'
        onSubmit={(event) => {
          void form.handleSubmit(onFormSubmit)(event);
        }}
      >
        <FormField
          control={form.control}
          name='goal'
          render={({ field }) => (
            <FormItem>
              <FormLabel>학습 목표</FormLabel>
              <FormControl>
                <Input
                  disabled={disabled}
                  placeholder='예: 듣기 취약 유형 집중 학습'
                  {...field}
                />
              </FormControl>
              <FormDescription>
                다음 시험까지 달성할 목표를 입력하세요.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button
          disabled={disabled}
          type='submit'
        >
          저장하기
        </Button>
      </form>
    </Form>
  );
}

const meta = {
  parameters: {
    layout: 'centered',
  },
  title: 'Shared/UI/Form',
} satisfies Meta;

/** Form primitive를 접근 가능한 실제 필드 조합으로 문서화한다 */
export default meta;

type Story = StoryObj;

/** label과 설명을 갖춘 입력 흐름의 기준 상태를 제공한다 */
export const Default: Story = {
  name: '기본',
  render: () => <FormExample />,
};

/** 검증 실패가 label·control·message에 연결되는 상태를 제공한다 */
export const Invalid: Story = {
  name: '오류',
  render: () => <FormExample invalid />,
};

/** 폼 전체를 수정하거나 제출할 수 없는 상태를 제공한다 */
export const Disabled: Story = {
  name: '비활성',
  render: () => <FormExample disabled />,
};
