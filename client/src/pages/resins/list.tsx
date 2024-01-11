import React from "react";
import { IResourceComponentsProps, useTranslate, useInvalidate, useNavigation } from "@refinedev/core";
import { useTable, List } from "@refinedev/antd";
import { Table, Button, Dropdown } from "antd";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { IResin } from "./model";
import { EditOutlined, EyeOutlined, FilterOutlined, PlusSquareOutlined } from "@ant-design/icons";
import { TableState, useInitialTableState, useStoreInitialState } from "../../utils/saveload";
import {
  DateColumn,
  FilteredQueryColumn,
  NumberColumn,
  RichColumn,
  SortedColumn,
  SpoolIconColumn,
  ActionsColumn,
} from "../../components/column";
import {
  useSpoolmanArticleNumbers,
  useSpoolmanResinNames,
  useSpoolmanMaterials,
  useSpoolmanVendors,
} from "../../components/otherModels";
import { useLiveify } from "../../components/liveify";
import { removeUndefined } from "../../utils/filtering";

dayjs.extend(utc);

interface IResinCollapsed extends Omit<IResin, "vendor"> {
  "vendor.name": string | null;
}

function collapseResin(element: IResin): IResinCollapsed {
  let vendor_name: string | null;
  if (element.vendor) {
    vendor_name = element.vendor.name;
  } else {
    vendor_name = null;
  }
  return { ...element, "vendor.name": vendor_name };
}

function translateColumnI18nKey(columnName: string): string {
  columnName = columnName.replace(".", "_");
  return `resin.fields.${columnName}`;
}

const namespace = "resinList-v2";

const allColumns: (keyof IResinCollapsed & string)[] = [
  "id",
  "vendor.name",
  "name",
  "material",
  "price",
  "density",
  "diameter",
  "weight",
  "bottle_weight",
  "article_number",
  "settings_cure_temp",
  "settings_cure_time",
  "settings_wash_time",
  "registered",
  "comment",
];
const defaultColumns = allColumns.filter(
  (column_id) => ["registered", "density", "diameter", "bottle_weight"].indexOf(column_id) === -1
);

export const ResinList: React.FC<IResourceComponentsProps> = () => {
  const t = useTranslate();
  const invalidate = useInvalidate();

  // Load initial state
  const initialState = useInitialTableState(namespace);

  // Fetch data from the API
  // To provide the live updates, we use a custom solution (useLiveify) instead of the built-in refine "liveMode" feature.
  // This is because the built-in feature does not call the liveProvider subscriber with a list of IDs, but instead
  // calls it with a list of filters, sorters, etc. This means the server-side has to support this, which is quite hard.
  const { tableProps, sorters, setSorters, filters, setFilters, current, pageSize, setCurrent } =
    useTable<IResinCollapsed>({
      syncWithLocation: false,
      pagination: {
        mode: "server",
        current: initialState.pagination.current,
        pageSize: initialState.pagination.pageSize,
      },
      sorters: {
        mode: "server",
        initial: initialState.sorters,
      },
      filters: {
        mode: "server",
        initial: initialState.filters,
      },
      liveMode: "manual",
      onLiveEvent(event) {
        if (event.type === "created" || event.type === "deleted") {
          // updated is handled by the liveify
          invalidate({
            resource: "resin",
            invalidates: ["list"],
          });
        }
      },
      queryOptions: {
        select(data) {
          return {
            total: data.total,
            data: data.data.map(collapseResin),
          };
        },
      },
    });

  // Create state for the columns to show
  const [showColumns, setShowColumns] = React.useState<string[]>(initialState.showColumns ?? defaultColumns);

  // Store state in local storage
  const tableState: TableState = {
    sorters,
    filters,
    pagination: { current, pageSize },
    showColumns,
  };
  useStoreInitialState(namespace, tableState);

  // Collapse the dataSource to a mutable list
  const queryDataSource: IResinCollapsed[] = React.useMemo(
    () => (tableProps.dataSource || []).map((record) => ({ ...record })),
    [tableProps.dataSource]
  );
  const dataSource = useLiveify("resin", queryDataSource, collapseResin);

  if (tableProps.pagination) {
    tableProps.pagination.showSizeChanger = true;
  }

  const { editUrl, showUrl, cloneUrl } = useNavigation();
  const actions = (record: IResinCollapsed) => [
    { name: t("buttons.show"), icon: <EyeOutlined />, link: showUrl("resin", record.id) },
    { name: t("buttons.edit"), icon: <EditOutlined />, link: editUrl("resin", record.id) },
    { name: t("buttons.clone"), icon: <PlusSquareOutlined />, link: cloneUrl("resin", record.id) },
  ];

  return (
    <List
      headerButtons={({ defaultButtons }) => (
        <>
          <Button
            type="primary"
            icon={<FilterOutlined />}
            onClick={() => {
              setFilters([], "replace");
              setSorters([{ field: "id", order: "asc" }]);
              setCurrent(1);
            }}
          >
            {t("buttons.clearFilters")}
          </Button>
          <Dropdown
            trigger={["click"]}
            menu={{
              items: allColumns.map((column_id) => ({
                key: column_id,
                label: t(translateColumnI18nKey(column_id)),
              })),
              selectedKeys: showColumns,
              selectable: true,
              multiple: true,
              onDeselect: (keys) => {
                setShowColumns(keys.selectedKeys);
              },
              onSelect: (keys) => {
                setShowColumns(keys.selectedKeys);
              },
            }}
          >
            <Button type="primary" icon={<EditOutlined />}>
              {t("buttons.hideColumns")}
            </Button>
          </Dropdown>
          {defaultButtons}
        </>
      )}
    >
      <Table<IResinCollapsed>
        {...tableProps}
        sticky
        tableLayout="auto"
        scroll={{ x: "max-content" }}
        dataSource={dataSource}
        rowKey="id"
        columns={removeUndefined([
          SortedColumn({
            id: "id",
            i18ncat: "resin",
            actions,
            dataSource,
            tableState,
            width: 70,
          }),
          FilteredQueryColumn({
            id: "vendor.name",
            i18nkey: "resin.fields.vendor_name",
            actions,
            dataSource,
            tableState,
            filterValueQuery: useSpoolmanVendors(),
          }),
          SpoolIconColumn({
            id: "name",
            i18ncat: "resin",
            color: (record: IResinCollapsed) => record.color_hex,
            actions,
            dataSource,
            tableState,
            filterValueQuery: useSpoolmanResinNames(),
          }),
          FilteredQueryColumn({
            id: "material",
            i18ncat: "resin",
            actions,
            dataSource,
            tableState,
            filterValueQuery: useSpoolmanMaterials(),
            width: 110,
          }),
          SortedColumn({
            id: "price",
            i18ncat: "resin",
            actions,
            dataSource,
            tableState,
            width: 80,
          }),
          NumberColumn({
            id: "density",
            i18ncat: "resin",
            unit: "g/cm³",
            decimals: 2,
            actions,
            dataSource,
            tableState,
            width: 100,
          }),
          NumberColumn({
            id: "diameter",
            i18ncat: "resin",
            unit: "mm",
            decimals: 2,
            actions,
            dataSource,
            tableState,
            width: 100,
          }),
          NumberColumn({
            id: "weight",
            i18ncat: "resin",
            unit: "g",
            decimals: 1,
            actions,
            dataSource,
            tableState,
            width: 100,
          }),
          NumberColumn({
            id: "bottle_weight",
            i18ncat: "resin",
            unit: "g",
            decimals: 1,
            actions,
            dataSource,
            tableState,
            width: 100,
          }),
          FilteredQueryColumn({
            id: "article_number",
            i18ncat: "resin",
            actions,
            dataSource,
            tableState,
            filterValueQuery: useSpoolmanArticleNumbers(),
            width: 130,
          }),
          NumberColumn({
            id: "settings_cure_temp",
            i18ncat: "resin",
            unit: "°C",
            decimals: 0,
            actions,
            dataSource,
            tableState,
            width: 100,
          }),
          NumberColumn({
            id: "settings_cure_time",
            i18ncat: "resin",
            unit: "s",
            decimals: 0,
            actions,
            dataSource,
            tableState,
            width: 100,
          }),
          NumberColumn({
            id: "settings_wash_time",
            i18ncat: "resin",
            unit: "s",
            decimals: 0,
            actions,
            dataSource,
            tableState,
            width: 100,
          }),
          DateColumn({
            id: "registered",
            i18ncat: "resin",
            actions,
            dataSource,
            tableState,
          }),
          RichColumn({
            id: "comment",
            i18ncat: "resin",
            actions,
            dataSource,
            tableState,
            width: 150,
          }),
          ActionsColumn(actions),
        ])}
      />
    </List>
  );
};

export default ResinList;
