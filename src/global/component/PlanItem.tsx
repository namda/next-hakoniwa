/**
 * @module PlanItem
 * @description 計画リストの1行分を表示・編集するコンポーネント。
 */
import { isEqual, omit } from '@/global/function/collection';
import { zodResolver } from '@hookform/resolvers/zod';
import { forwardRef, memo, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { IoTrash } from 'react-icons/io5';
import { RxDragHandleVertical } from 'react-icons/rx';
import META_DATA from '../define/metadata';
import { getPlanDefine, getPlanSelect } from '../define/planType';
import { planInfoZod, planInfoZodValid } from '../valid/planInfo';
import Modal from './Modal';
import { PlanItemProps } from './PlanList.types';
import { RangeSliderRHF } from './RangeSliderRHF';
import { SelectRHF } from './SelectRHF';
import Tooltip from './Tooltip';

const isShowTimes = (times: number, edit: boolean) => times > 1 && !edit;
const idShowToIsland = (fromUuid?: string, toUuid?: string) => fromUuid && fromUuid !== toUuid;
const getPlanItemLayoutClass = (isCompact: boolean, compactClass: string, desktopClass: string) =>
  isCompact ? compactClass : desktopClass;

// -----------------------------------------------------------------------------
// Component: PlanItem
// -----------------------------------------------------------------------------

const PlanItem = memo(
  forwardRef<HTMLDivElement, PlanItemProps>(
    (
      {
        isCompact,
        fromUuid,
        isChange,
        islandOptions,
        item,
        onUpdate,
        turn,
        onDelete,
        isDragged,
        onPointerDown,
      }: PlanItemProps,
      itemRef
    ) => {
      const { id, x, y, plan, times, edit, to_uuid } = item;
      const { name, description, immediate, otherIsland, minTimes, maxTimes } = getPlanDefine(plan);

      const { control, subscribe, reset, setValue } = useForm<Omit<planInfoZod, 'from_uuid'>>({
        defaultValues: item,
        resolver: zodResolver(planInfoZodValid.omit({ from_uuid: true })),
      });

      useEffect(() => {
        reset(item);
      }, [item, reset]);

      useEffect(() => {
        const unsubscribe = subscribe({
          formState: { values: true },
          callback: ({ values }) => {
            const formData = planInfoZodValid.omit({ from_uuid: true }).safeParse(values);
            if (!formData.success) return;

            const data = formData.data;
            if (!isEqual(data, omit(item, ['id']))) {
              Promise.resolve().then(() => {
                onUpdate(item.id, { ...data, edit: data.edit ?? false });
              });
            }
          },
        });
        return () => unsubscribe();
      }, [subscribe, item, onUpdate]);

      const toggleEdit = () => setValue('edit', !edit);

      const renderEditForm = (isModal: boolean) => (
        <div className={`grid w-full grid-cols-1 gap-2 p-1 ${isModal ? '' : 'grid-cols-2 gap-4'}`}>
          <div className="flex items-center gap-2">
            <Tooltip
              position="bottom"
              tooltipComp={
                <p
                  className={`max-w-sm min-w-64 text-left whitespace-pre-wrap ${getPlanItemLayoutClass(isCompact, 'text-sm', 'text-sm')}`}
                >
                  {description}
                </p>
              }
            >
              <SelectRHF
                name="plan"
                control={control}
                id={`plan-${item.id}`}
                options={getPlanSelect()}
                isBottomSpace={false}
                className="w-full flex-1"
              />
            </Tooltip>
          </div>
          <div className="flex items-center gap-2">
            <label
              className={`font-bold whitespace-nowrap ${getPlanItemLayoutClass(isCompact, 'text-sm', 'text-sm')}`}
              htmlFor={`to_uuid-${item.id}`}
            >
              目標島
            </label>
            <SelectRHF
              name="to_uuid"
              control={control}
              id={`to_uuid-${item.id}`}
              options={islandOptions}
              isBottomSpace={false}
              disabled={!otherIsland}
              className="w-full flex-1"
            />
          </div>
          <div className="flex items-center gap-3 xl:gap-2">
            <label
              className={`font-bold whitespace-nowrap ${getPlanItemLayoutClass(isCompact, 'text-sm', 'text-sm')}`}
              htmlFor={`x-${item.id}`}
            >
              X座標
            </label>
            <div className="flex-1 text-sm">
              <RangeSliderRHF
                id={`x-${item.id}`}
                name="x"
                control={control}
                max={META_DATA.MAP_SIZE - 1}
                isBottomSpace={false}
                className="w-full"
              />
            </div>
          </div>
          <div className="flex items-center gap-3 xl:gap-2">
            <label
              className={`font-bold whitespace-nowrap ${getPlanItemLayoutClass(isCompact, 'text-sm', 'text-sm')}`}
              htmlFor={`y-${item.id}`}
            >
              Y座標
            </label>
            <div className="flex-1 text-sm">
              <RangeSliderRHF
                id={`y-${item.id}`}
                name="y"
                control={control}
                max={META_DATA.MAP_SIZE - 1}
                isBottomSpace={false}
                className="w-full"
              />
            </div>
          </div>
          <div
            className={`flex max-w-md items-center gap-2 ${getPlanItemLayoutClass(isCompact, '', 'col-span-2')}`}
          >
            <label
              className={`font-bold whitespace-nowrap ${getPlanItemLayoutClass(isCompact, 'text-sm', 'text-sm')}`}
              htmlFor={`times-${item.id}`}
            >
              計画数
            </label>
            <div className="flex-1">
              <RangeSliderRHF
                id={`times-${item.id}`}
                name="times"
                control={control}
                min={minTimes}
                max={maxTimes}
                isBottomSpace={false}
                className="w-full"
              />
            </div>
          </div>
        </div>
      );

      return (
        <div
          ref={itemRef}
          className={`card-border mb-0.5 flex items-stretch ${getPlanItemLayoutClass(isCompact, 'gap-y-1', 'gap-y-0')} ${isChange ? 'bg-orange-50' : 'bg-teal-50'} ${isDragged ? 'opacity-50' : ''}`}
        >
          {/* ドラッグハンドル: pointerdown のみを受け付ける */}
          <div
            className="flex cursor-grab items-stretch"
            style={{ touchAction: 'none' }}
            onPointerDown={(e) => onPointerDown(e, id)}
          >
            <div className={`flex items-stretch`}>
              <span className="inline-flex h-full items-center justify-center rounded-sm bg-orange-200 text-gray-400">
                <RxDragHandleVertical />
              </span>
            </div>
            <span
              className={`inline-block self-center font-mono text-shadow-xs/30 ${getPlanItemLayoutClass(isCompact, 'min-w-[3em] text-sm', 'min-w-[2.35em] text-xs leading-none')} ${immediate ? 'text-sky-500' : ''}`}
            >
              {`T${turn}`}
            </span>
          </div>

          <button
            onClick={toggleEdit}
            className={`bg-sky-700 text-white hover:cursor-pointer hover:bg-sky-600 ${getPlanItemLayoutClass(isCompact, 'mx-2 px-1.5', 'mx-0.5 px-0.5')}`}
          >
            <p
              className={`text-center font-semibold [writing-mode:vertical-rl] ${getPlanItemLayoutClass(isCompact, 'text-sm', 'text-[10px] leading-none')}`}
            >
              {edit ? 'Close' : 'Edit'}
            </p>
          </button>

          <div>
            {edit && !isCompact ? (
              renderEditForm(false)
            ) : (
              <Tooltip
                position="bottom"
                tooltipComp={
                  <p
                    className={`max-w-sm min-w-64 text-left whitespace-pre-wrap ${getPlanItemLayoutClass(isCompact, 'text-sm', 'text-sm')}`}
                  >
                    {description}
                  </p>
                }
              >
                <div
                  className={`grid items-center ${getPlanItemLayoutClass(isCompact, 'grid-cols-[auto] grid-rows-[auto_auto]', 'grid-cols-[auto_auto] grid-rows-1 gap-1')}`}
                >
                  <div>
                    {!edit && (
                      <div
                        className={`font-mono font-extrabold text-shadow-md ${getPlanItemLayoutClass(isCompact, 'text-sm', 'text-xs leading-none')}`}
                      >{`(${x},${y})`}</div>
                    )}
                    <div
                      className={`flex items-center font-medium text-shadow-xs/30 ${getPlanItemLayoutClass(isCompact, 'ml-2 gap-1.5 text-sm', 'ml-0.5 gap-1 text-sm leading-none')} ${immediate ? 'text-sky-500' : 'text-amber-500'}`}
                    >
                      {name}
                      {isShowTimes(times, edit) && (
                        <span
                          className={`inline-flex shrink-0 items-center gap-0.5 rounded-full bg-rose-600 font-mono text-xs font-bold text-white shadow-sm ${getPlanItemLayoutClass(isCompact, 'px-2 py-0.5', 'px-1 py-0 text-[10px]')}`}
                        >
                          ×{times}
                        </span>
                      )}
                    </div>
                  </div>
                  {idShowToIsland(fromUuid, to_uuid) && (
                    <div
                      className={`shrink-0 truncate rounded-full bg-teal-700 text-center font-mono text-xs font-bold text-white shadow-sm ${getPlanItemLayoutClass(isCompact, 'mt-1 mb-2 ml-2 px-2 py-0.5', 'm-0 px-1 py-0 text-[10px]')}`}
                    >
                      {`目標:${islandOptions.find((opt) => opt.value === to_uuid)?.label ?? 'Unknown'}`}
                    </div>
                  )}
                </div>
              </Tooltip>
            )}
          </div>

          {isCompact && edit && (
            <Modal
              open={edit}
              openToggle={toggleEdit}
              header={`${name}の編集 (${x},${y})`}
              body={renderEditForm(true)}
              className="!w-[96%] !max-w-md"
            />
          )}

          <button
            onClick={() => onDelete(id)}
            className={`ml-auto text-gray-400 transition-colors hover:cursor-pointer hover:text-red-600 focus:outline-none ${getPlanItemLayoutClass(isCompact, 'p-2', 'p-0.5')}`}
            aria-label="Delete plan"
          >
            <IoTrash className={getPlanItemLayoutClass(isCompact, 'text-xl', 'text-sm')} />
          </button>
        </div>
      );
    }
  ),
  (prev: PlanItemProps, next: PlanItemProps) =>
    isEqual(prev.item, next.item) &&
    prev.turn === next.turn &&
    prev.isCompact === next.isCompact &&
    prev.isChange === next.isChange &&
    prev.isDragged === next.isDragged &&
    isEqual(prev.islandOptions, next.islandOptions)
);

PlanItem.displayName = 'PlanItem';

export default PlanItem;
